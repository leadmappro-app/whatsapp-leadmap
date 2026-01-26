import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Database, MessageSquare, Trash2, FlaskConical, CheckCircle2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface CoverageReport {
  instances: number;
  contacts: number;
  conversations: number;
  messages: number;
  message_types: {
    text: number;
    image: number;
    document: number;
    audio: number;
    video: number;
  };
  macros: number;
  sentiment_rows: number;
  summaries: number;
  notes: number;
  pinned_notes: number;
  conversations_with_unread: number;
}

export const MockDevTools = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSendingMock, setIsSendingMock] = useState(false);
  const [mockMessage, setMockMessage] = useState("");
  const [selectedConversation, setSelectedConversation] = useState("");
  const queryClient = useQueryClient();

  // Fetch mock conversations
  const { data: mockConversations = [], refetch } = useQuery({
    queryKey: ['mock-conversations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select(`
          id,
          last_message_preview,
          whatsapp_contacts(name),
          whatsapp_instances!inner(provider_type)
        `)
        .eq('whatsapp_instances.provider_type', 'mock')
        .order('last_message_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const handleSeedData = async (reset: boolean = false) => {
    setIsSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-whatsapp-mocks', {
        body: { reset }
      });

      if (error) throw error;

      const coverage = data.coverage as CoverageReport;
      
      // Show detailed coverage report
      toast.success(`Mock seed completo! ✅`, {
        description: (
          <div className="text-xs space-y-1 mt-1">
            <p className="font-medium">📊 Coverage Report:</p>
            <p>• {coverage.conversations} conversas | {coverage.messages} mensagens</p>
            <p>• Mídia: {coverage.message_types.image} img, {coverage.message_types.document} doc, {coverage.message_types.audio} audio, {coverage.message_types.video} video</p>
            <p>• Sidebar: {coverage.sentiment_rows} sentimento, {coverage.summaries} resumos, {coverage.notes} notas ({coverage.pinned_notes} fixadas)</p>
            <p>• {coverage.conversations_with_unread} conversas não lidas</p>
            <p>• {coverage.macros} macros disponíveis</p>
          </div>
        ),
        duration: 12000
      });

      // Force refresh all related queries
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-macros'] });
      queryClient.invalidateQueries({ queryKey: ['mock-conversations'] });
      refetch();
      
    } catch (error) {
      toast.error("Erro ao gerar dados mock", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSendMockMessage = async () => {
    if (!selectedConversation || !mockMessage.trim()) {
      toast.error("Selecione uma conversa e digite uma mensagem");
      return;
    }

    setIsSendingMock(true);
    try {
      const { data, error } = await supabase.functions.invoke('mock-inbound-message', {
        body: {
          conversationId: selectedConversation,
          content: mockMessage
        }
      });

      if (error) throw error;

      toast.success("Mensagem simulada enviada!");
      setMockMessage("");
      
      // Refresh conversations
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      refetch();
    } catch (error) {
      toast.error("Erro ao simular mensagem", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsSendingMock(false);
    }
  };

  return (
    <Card className="border-dashed border-yellow-500/50 bg-yellow-500/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-yellow-600" />
          <CardTitle className="text-lg">Ambiente de Teste (Mock)</CardTitle>
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
            Dev Only
          </Badge>
        </div>
        <CardDescription>
          Ferramentas para testar o sistema sem API WhatsApp real. Gera mídia real no Storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Seed Data */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Gerar Dados de Teste</Label>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => handleSeedData(false)}
              disabled={isSeeding}
            >
              {isSeeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
              Gerar Dados
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleSeedData(true)}
              disabled={isSeeding}
            >
              {isSeeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Resetar e Gerar
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Instância mock + 10 contatos + 10 conversas</p>
            <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> 60+ mensagens com todos os tipos de mídia</p>
            <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> 8+ sentimentos, resumos e notas na sidebar</p>
            <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> 12 macros prontos para uso</p>
          </div>
        </div>

        {/* Simulate Inbound Message */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Simular Mensagem Recebida</Label>
          <div className="grid gap-3">
            <Select value={selectedConversation} onValueChange={setSelectedConversation}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conversa mock" />
              </SelectTrigger>
              <SelectContent>
                {mockConversations.map((conv: any) => (
                  <SelectItem key={conv.id} value={conv.id}>
                    {conv.whatsapp_contacts?.name || 'Desconhecido'} - {conv.last_message_preview?.substring(0, 30)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                placeholder="Digite a mensagem simulada..."
                value={mockMessage}
                onChange={(e) => setMockMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMockMessage()}
              />
              <Button 
                onClick={handleSendMockMessage}
                disabled={isSendingMock || !selectedConversation || !mockMessage.trim()}
              >
                {isSendingMock ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Simula uma mensagem recebida do cliente (incrementa unread_count)
          </p>
        </div>
      </CardContent>
    </Card>
  );
};