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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { Loader2, Check, Copy, Link as LinkIcon, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const formSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  instance_name: z
    .string()
    .min(1, "Nome da instância obrigatório")
    .regex(/^[a-zA-Z0-9_-]+$/, "Apenas letras, números, _ e -"),
  instance_id_external: z.string().optional(),
  waba_id: z.string().optional(),
  api_url: z.string().optional(),
  api_key: z.string().optional(),
  provider_type: z.enum(["self_hosted", "cloud", "mock", "uzapi"]),
}).refine((data) => {
  // Mock mode doesn't require URL/Key
  if (data.provider_type === 'mock') return true;
  return data.api_url && data.api_key;
}, {
  message: "URL e API Key são obrigatórios para instâncias reais",
  path: ["api_url"],
});

type FormValues = z.infer<typeof formSchema>;

interface AddInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddInstanceDialog = ({ open, onOpenChange }: AddInstanceDialogProps) => {
  const { createInstance, testConnection } = useWhatsAppInstances();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [showWebhookInstructions, setShowWebhookInstructions] = useState(false);
  const [createdInstanceId, setCreatedInstanceId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      instance_name: "",
      instance_id_external: "",
      waba_id: "",
      api_url: "",
      api_key: "",
      provider_type: "self_hosted",
    },
  });

  const providerType = form.watch("provider_type");

  const handleTestConnection = async () => {
    const values = form.getValues();

    // Validate required fields for testing
    const fieldsToValidate = (values.provider_type === 'cloud' || values.provider_type === 'uzapi')
      ? ["api_url", "api_key", "instance_name", "instance_id_external"] as const
      : ["api_url", "api_key", "instance_name"] as const;
    const isValid = await form.trigger(fieldsToValidate);

    if (!isValid) {
      toast.error("Preencha os campos obrigatórios para testar a conexão");
      return;
    }

    // For Cloud and UzAPI, instance_id_external is required
    if ((values.provider_type === 'cloud' || values.provider_type === 'uzapi') && !values.instance_id_external) {
      const fieldName = values.provider_type === 'uzapi' ? 'Phone Number ID' : 'ID da Instância';
      toast.error(`${fieldName} é obrigatório`);
      return;
    }

    setIsTestingConnection(true);
    try {
      // Call edge function to test connection (avoids CORS issues)
      const { data, error } = await supabase.functions.invoke('test-evolution-connection', {
        body: {
          api_url: values.api_url,
          api_key: values.api_key,
          instance_name: values.instance_name,
          instance_id_external: values.instance_id_external,
          provider_type: values.provider_type
        }
      });

      if (error) {
        throw new Error(error.message || 'Falha ao testar conexão');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setConnectionTested(true);
      toast.success("Conexão testada com sucesso!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Falha ao testar conexão";
      toast.error(`Falha ao testar conexão: ${errorMessage}`);
      setConnectionTested(false);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const isMock = values.provider_type === 'mock';

      // Create instance with secrets and provider_type
      const result = await createInstance.mutateAsync({
        name: values.name,
        instance_name: isMock ? `mock-${Date.now()}` : values.instance_name,
        instance_id_external: (values.provider_type === 'cloud' || values.provider_type === 'uzapi')
          ? values.instance_id_external
          : undefined,
        waba_id: values.provider_type === 'uzapi' ? values.waba_id : undefined,
        api_url: isMock ? 'mock://local' : values.api_url!,
        api_key: isMock ? 'mock' : values.api_key!,
        provider_type: values.provider_type,
        status: isMock ? 'connected' : undefined,
      } as any);

      setCreatedInstanceId(result.id);

      if (isMock) {
        toast.success("Instância mock criada!", {
          description: "Use as DevTools para gerar dados de teste"
        });
        handleClose();
      } else {
        setShowWebhookInstructions(true);
      }
      form.reset();
      setConnectionTested(false);
    } catch (error) {
      toast.error("Erro ao criar instância");
    }
  };

  const handleClose = () => {
    if (!showWebhookInstructions) {
      form.reset();
      setConnectionTested(false);
    }
    setShowWebhookInstructions(false);
    setCreatedInstanceId(null);
    onOpenChange(false);
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada!");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        {!showWebhookInstructions ? (
          <>
            <DialogHeader>
              <DialogTitle>Nova Instância</DialogTitle>
              <DialogDescription>
                Adicione uma nova instância da Evolution API ou UzAPI
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="provider_type"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1.5">
                        <FormLabel>Tipo de Provedor</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[250px]">
                            <p>Selecione o provedor que você está utilizando.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="self_hosted">Evolution API Self-Hosted</SelectItem>
                          <SelectItem value="cloud">Evolution API Cloud</SelectItem>
                          <SelectItem value="uzapi">UzAPI (Gateway Oficial)</SelectItem>
                          <SelectItem value="mock">
                            <div className="flex items-center gap-2">
                              🧪 Modo Mock (Teste sem API)
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1.5">
                        <FormLabel>Nome</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[250px]">
                            <p>Nome para identificar a instância na plataforma (ex: 'WhatsApp Vendas', 'Suporte Técnico')</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <Input placeholder="Minha Instância" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instance_name"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1.5">
                        <FormLabel>Nome da Instância</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[250px]">
                            <p>{providerType === 'uzapi' ? 'Nome de identificação interno.' : 'Nome exato da instância configurada no Evolution API.'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <Input placeholder="my-instance" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(providerType === 'cloud' || providerType === 'uzapi') && (
                  <FormField
                    control={form.control}
                    name="instance_id_external"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-1.5">
                          <FormLabel>{providerType === 'uzapi' ? 'Phone Number ID' : 'ID da Instância (UUID)'}</FormLabel>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[250px]">
                              <p>
                                {providerType === 'uzapi'
                                  ? 'ID do número de telefone (Phone Number ID) fornecido pela UzAPI.'
                                  : 'ID único da instância no Evolution Cloud (UUID).'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <FormControl>
                          <Input placeholder={providerType === 'uzapi' ? "942911219636873" : "ead6f2f2-7633-4e41-a08d-7272300a6ba1"} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {providerType === 'uzapi' && (
                  <FormField
                    control={form.control}
                    name="waba_id"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-1.5">
                          <FormLabel>WABA-ID</FormLabel>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[250px]">
                              <p>
                                WhatsApp Business Account ID fornecido pela UzAPI (diferente do Phone Number ID).
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <FormControl>
                          <Input placeholder="9359088363..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}


                {providerType !== 'mock' && (
                  <>
                    <FormField
                      control={form.control}
                      name="api_url"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-1.5">
                            <FormLabel>
                              {providerType === 'uzapi' ? 'Username UzAPI' : 'URL da API'}
                            </FormLabel>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[250px]">
                                <p>
                                  {providerType === 'cloud'
                                    ? 'URL do Evolution Cloud (ex: https://api.evoapicloud.com)'
                                    : providerType === 'uzapi'
                                      ? 'Seu nome de usuário na plataforma UzAPI (apenas o username, sem URL)'
                                      : 'URL de acesso ao seu Evolution API.'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <FormControl>
                            <Input
                              placeholder={
                                providerType === 'cloud'
                                  ? "https://api.evoapicloud.com"
                                  : providerType === 'uzapi'
                                    ? "cristiannoldin"
                                    : "https://api.evolution.com"
                              }
                              {...field}
                            />
                          </FormControl>
                          {providerType === 'uzapi' && field.value && (
                            <p className="text-[0.8rem] text-muted-foreground mt-1">
                              URL gerada: <code>https://api.uzapi.com.br/{field.value}</code>
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="api_key"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-1.5">
                            <FormLabel>
                              {providerType === 'cloud' ? 'Token da Instância' : 'API Key/Token'}
                            </FormLabel>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[250px]">
                                <p>
                                  {providerType === 'cloud'
                                    ? 'Token de autenticação da instância.'
                                    : providerType === 'uzapi'
                                      ? 'Token de acesso (Bearer Token) da UzAPI.'
                                      : 'Chave de autenticação da API.'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {providerType === 'mock' && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Modo Mock:</strong> Não precisa de URL ou API Key. A instância será criada conectada para testes.
                      Use as DevTools em Configurações para gerar dados de teste.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  {providerType !== 'mock' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={isTestingConnection}
                    >
                      {isTestingConnection ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : connectionTested ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : null}
                      Testar Conexão
                    </Button>
                  )}

                  <Button
                    type="submit"
                    disabled={(providerType !== 'mock' && !connectionTested) || createInstance.isPending}
                    className="ml-auto"
                  >
                    {createInstance.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {providerType === 'mock' ? 'Criar Mock' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </Form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Instância criada com sucesso!
              </DialogTitle>
              <DialogDescription>
                Configure o webhook {providerType === 'uzapi' ? 'na UzAPI' : 'na Evolution API'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert>
                <LinkIcon className="h-4 w-4" />
                <AlertDescription className="space-y-2 mt-2">
                  <div>
                    <strong>URL do Webhook:</strong>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 bg-muted p-2 rounded text-xs break-all">
                        {webhookUrl}
                      </code>
                      <Button size="sm" variant="outline" onClick={copyWebhookUrl}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <strong>Events:</strong>
                    <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                      <li>MESSAGES_UPSERT</li>
                      <li>MESSAGES_UPDATE</li>
                      <li>CONNECTION_UPDATE</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>

              <Button onClick={handleClose} className="w-full">
                Fechar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};