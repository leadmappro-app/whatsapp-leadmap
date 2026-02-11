import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { RefreshCw, Check, Copy, Link as LinkIcon, Info, QrCode, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const formSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  instance_name: z.string().optional(),
  provider_type: z.enum(["self_hosted", "cloud", "mock", "uzapi"]),
  // Pro fields (only for admin)
  api_url: z.string().optional(),
  api_key: z.string().optional(),
  instance_id_external: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddInstanceDialog = ({ open, onOpenChange }: AddInstanceDialogProps) => {
  const { createInstance } = useWhatsAppInstances();
  const { isAdmin } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [showProMode, setShowProMode] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      instance_name: "",
      provider_type: "uzapi",
      api_url: "",
      api_key: "",
      instance_id_external: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsCreating(true);
    try {
      console.log('🚀 [AddInstanceDialog] Starting instance creation...', values);

      if (values.provider_type === 'uzapi' && !showProMode) {
        // SaaS Flow: Call uazapi-manager to create instance automatically
        // Alphanumeric name to be safer with various APIs
        const generatedInstanceName = `inst${Math.random().toString(36).substring(2, 9)}`;

        const { data, error } = await supabase.functions.invoke('uazapi-manager', {
          body: {
            action: 'create-instance',
            name: values.name,
            instance_name: generatedInstanceName,
          }
        });

        if (error) {
          console.error('❌ [AddInstanceDialog] Function error raw:', error);
          let errMsg = error.message || "Erro ao chamar a API";
          try {
            if (error instanceof Error && 'context' in error) {
              const httpError = error as any;
              const bodyStr = await httpError.context?.json?.(); // Try to get JSON if available
              const bodyObj = bodyStr || (httpError.context?.body ? JSON.parse(httpError.context.body) : null);

              console.log('❌ [AddInstanceDialog] Error Body:', bodyObj);

              if (bodyObj?.error) {
                const inner = bodyObj.error;
                errMsg = typeof inner === 'string' ? inner : JSON.stringify(inner);
              } else if (bodyObj?.message) {
                // Gateway errors like 401 Invalid JWT come as { message: "..." }
                errMsg = bodyObj.message;
              }
            }
          } catch (e) {
            console.error('Error parsing response body', e);
          }

          throw new Error(errMsg);
        }

        if (data?.error) {
          const errorDetail = data.error;
          console.error('❌ [AddInstanceDialog] API error details:', errorDetail);
          let errorMessage = "Erro na API UazAPI";
          if (typeof errorDetail === 'string') {
            errorMessage = errorDetail;
          } else if (errorDetail?.message) {
            errorMessage = errorDetail.message;
          } else if (typeof errorDetail === 'object') {
            try { errorMessage = JSON.stringify(errorDetail); } catch { /* keep default */ }
          }
          throw new Error(errorMessage);
        }

        if (!data?.instance?.id) {
          console.error('❌ [AddInstanceDialog] No instance returned:', data);
          throw new Error("Falha ao receber confirmação da instância criada.");
        }

        toast.success("Instância criada! Carregando QR Code...");

        // Wait 2 seconds for UazAPI to process the deployment
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Fetch QR Code immediately
        const { data: qrData, error: qrError } = await supabase.functions.invoke('uazapi-manager', {
          body: {
            action: 'get-qrcode',
            instanceId: data.instance.id
          }
        });

        if (qrError) {
          console.error('❌ [AddInstanceDialog] QR Code function error:', qrError);
          toast.info("Aguarde alguns segundos e atualize a página para ver o QR Code.");
          handleClose();
          return;
        }

        console.log('📥 [AddInstanceDialog] QR Data received:', qrData);

        if (qrData?.qrcode || qrData?.base64 || qrData?.data?.qrcode) {
          setQrCodeData(qrData.qrcode || qrData.base64 || qrData.data?.qrcode);
          setShowQrCode(true);
        } else {
          console.warn('⚠️ [AddInstanceDialog] No QR code in data:', qrData);
          toast.info("Aguarde alguns segundos e atualize a página para ver o QR Code.");
          handleClose();
        }
      } else {
        // Regular Flow (Admin/Pro)
        await createInstance.mutateAsync({
          name: values.name,
          instance_name: values.instance_name || values.name,
          provider_type: values.provider_type,
          api_url: values.api_url || "",
          api_key: values.api_key || "",
          instance_id_external: values.instance_id_external || null,
        } as any);

        toast.success("Instância criada com sucesso!");
        handleClose();
      }
    } catch (error: any) {
      console.error('Error creating instance:', error);
      const msg = typeof error === 'string' ? error : (error?.message || "Erro ao criar instância");
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setShowQrCode(false);
    setQrCodeData(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        {/* Stable container to prevent DOM reconciliation issues */}
        <div className="stable-content-wrapper">
          {/* Stable container with both views rendered but toggled via visibility */}
          <div className="stable-content-wrapper">
            <div key="form-view" className={showQrCode ? "hidden" : "block space-y-4"}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  Conectar Novo WhatsApp
                </DialogTitle>
                <DialogDescription>
                  Dê um nome para sua conexão e clique em conectar para gerar o QR Code.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Conexão</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Meu WhatsApp Vendas" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {!showProMode ? (
                    <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-primary">
                        <Shield className="h-4 w-4" />
                        Conexão Segura via UzAPI
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Utilizamos um gateway oficial para garantir a estabilidade do seu número.
                        Basta clicar no botão abaixo e escanear o código que aparecerá na tela.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 border-t pt-4">
                      <FormField
                        control={form.control}
                        name="provider_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Provedor</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="uzapi">UzAPI (Recomendado)</SelectItem>
                                <SelectItem value="self_hosted">Evolution API (Local)</SelectItem>
                                <SelectItem value="cloud">Evolution API (Cloud)</SelectItem>
                                <SelectItem value="mock">Modo Teste (Simulação)</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="api_url"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>URL da API</FormLabel>
                            <Input {...field} />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="api_key"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Token/API Key</FormLabel>
                            <Input type="password" {...field} />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
                      disabled={isCreating}
                    >
                      {isCreating ? (
                        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <QrCode className="mr-2 h-5 w-5" />
                      )}
                      {isCreating ? "Criando Instância..." : "Gerar QR Code Agora"}
                    </Button>

                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-primary"
                        onClick={() => setShowProMode(!showProMode)}
                      >
                        {showProMode ? "Voltar ao Modo Simples" : "Modo Profissional (Evolution/Manual)"}
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </div>

            <div key="qr-view" className={!showQrCode ? "hidden" : "flex flex-col items-center py-6 space-y-6 text-center"}>
              <DialogHeader>
                <DialogTitle>Escaneie o QR Code</DialogTitle>
                <DialogDescription>
                  Abra o WhatsApp no seu celular &gt; Configurações &gt; Aparelhos Conectados &gt; Conectar um aparelho.
                </DialogDescription>
              </DialogHeader>

              <div className="relative p-4 bg-white rounded-2xl shadow-inner border-4 border-primary/10">
                {qrCodeData ? (
                  <img src={qrCodeData} alt="WhatsApp QR Code" className="w-64 h-64" />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center bg-muted animate-pulse rounded-lg">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Badge variant="outline" className="animate-pulse px-3 py-1">
                  Aguardando conexão...
                </Badge>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  O sistema detectará automaticamente quando você conectar.
                </p>
              </div>

              <Button onClick={handleClose} variant="outline" className="w-full">
                Fechar e concluir depois
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog >
  );
};
