import { useState, useEffect } from "react";
import { ConversationsSidebar } from "@/components/conversations";
import { ChatArea, ConversationDetailsSidebar } from "@/components/chat";
import { useWhatsAppInstances, useWhatsAppConversations } from "@/hooks/whatsapp";
import { useNotifications } from "@/hooks/useNotifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { useInstanceStatusMonitor } from "@/hooks/useInstanceStatusMonitor";
import { DisconnectedInstancesBanner } from "@/components/notifications/DisconnectedInstancesBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, ArrowLeft, FlaskConical, RefreshCw, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const WhatsApp = () => {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { setSelectedConversationId } = useNotifications();
  const [isDetailsSidebarCollapsed, setIsDetailsSidebarCollapsed] = useState(false);
  const [isConversationsSidebarCollapsed, setIsConversationsSidebarCollapsed] = useState(false);
  const [isActivatingMock, setIsActivatingMock] = useState(false);
  const { instances, isLoading: isLoadingInstances } = useWhatsAppInstances();
  const { disconnectedInstances } = useInstanceStatusMonitor();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // Show all conversations from all instances by default
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>(undefined);

  // Fetch conversations to get contact name
  const { conversations } = useWhatsAppConversations({ instanceId: selectedInstanceId });
  const selectedConv = conversations.find(c => c.id === selectedConversation);

  // Inform NotificationContext about open conversation
  useEffect(() => {
    setSelectedConversationId(selectedConversation);
    return () => setSelectedConversationId(null);
  }, [selectedConversation, setSelectedConversationId]);

  const handleSelectConversation = (id: string | null) => {
    setSelectedConversation(id);
  };

  const handleBackToSidebar = () => {
    setSelectedConversation(null);
  };

  const handleActivateMockMode = async () => {
    setIsActivatingMock(true);
    try {
      // Verificar sessão antes de chamar
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error("Você precisa estar logado para ativar o modo mock");
        return;
      }

      const { data, error } = await supabase.functions.invoke('seed-whatsapp-mocks', {
        body: { reset: true }
      });
      
      if (error) {
        // Detectar 401 de forma robusta (não por message.includes)
        const status = 
          (error as any)?.context?.status ||
          (error as any)?.status ||
          null;
        
        if (status === 401) {
          console.log('[WhatsApp] Token may be expired, refreshing session...');
          const { error: refreshError } = await supabase.auth.refreshSession();
          
          if (refreshError) {
            toast.error("Sessão expirada. Por favor, faça login novamente.");
            return;
          }
          
          // Retry após refresh
          const { data: retryData, error: retryError } = await supabase.functions.invoke('seed-whatsapp-mocks', {
            body: { reset: true }
          });
          
          if (retryError) {
            const retryStatus = 
              (retryError as any)?.context?.status ||
              (retryError as any)?.status ||
              null;
            
            if (retryStatus === 401) {
              toast.error("Sessão inválida — refaça login");
            } else {
              toast.error("Erro ao ativar modo mock", {
                description: retryError.message || "Tente novamente"
              });
            }
            return;
          }
          
          handleSeedSuccess(retryData);
          return;
        }
        
        // Outro erro (não 401)
        throw error;
      }
      
      handleSeedSuccess(data);
    } catch (error: any) {
      console.error('[WhatsApp] Error activating mock mode:', error);
      toast.error("Erro ao ativar modo mock", {
        description: error.message || "Erro desconhecido"
      });
    } finally {
      setIsActivatingMock(false);
    }
  };

  const handleSeedSuccess = (data: any) => {
    const coverage = data?.coverage;
    toast.success("Modo Mock ativado!", {
      description: coverage 
        ? `${coverage.conversations} conversas e ${coverage.messages} mensagens criadas`
        : "Instância e dados de teste criados com sucesso",
      duration: 5000
    });
    
    // Force refresh usando as query keys CORRETAS do projeto
    queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'contacts'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'macros'] });
  };

  // Mobile: show sidebar OR chat, never both
  const showSidebar = !isMobile || !selectedConversation;
  const showChat = !isMobile || selectedConversation;
  
  // Show welcome screen when no instances and not loading
  const showWelcome = !isLoadingInstances && instances.length === 0;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* Disconnected Instances Banner */}
      {!showWelcome && <DisconnectedInstancesBanner instances={disconnectedInstances} />}
      
      <div className="flex flex-1 overflow-hidden">
      
      {/* Welcome Screen - when no instances */}
      {showWelcome ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Bem-vindo ao WhatsApp</CardTitle>
              <CardDescription>
                Configure uma instância para começar a receber e enviar mensagens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleActivateMockMode}
                disabled={isActivatingMock}
              >
                {isActivatingMock ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4 mr-2" />
                )}
                Ativar Modo Mock (Testes)
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Cria conversas e mensagens simuladas para testar o sistema
              </p>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">ou</span>
                </div>
              </div>
              
              <Link to="/whatsapp/settings?tab=instances" className="block">
                <Button variant="outline" className="w-full" size="lg">
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar Instância Real
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* Sidebar */}
          {showSidebar && (
            <div className={`${isMobile ? "w-full" : isConversationsSidebarCollapsed ? "w-14" : "w-[350px]"} border-r border-border`}>
              <ConversationsSidebar
                selectedId={selectedConversation}
                onSelect={handleSelectConversation}
                instanceId={selectedInstanceId}
                isCollapsed={!isMobile && isConversationsSidebarCollapsed}
                onToggleCollapse={() => setIsConversationsSidebarCollapsed(!isConversationsSidebarCollapsed)}
              />
            </div>
          )}

          {/* Chat Area */}
          {showChat && (
            <div className="flex-1 flex flex-col">
              {/* Mobile back button */}
              {isMobile && selectedConversation && (
                <div className="border-b border-border p-2">
                  <Button variant="ghost" size="sm" onClick={handleBackToSidebar}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                </div>
              )}
              <ChatArea conversationId={selectedConversation} />
            </div>
          )}

          {/* Details Sidebar - hidden on mobile */}
          {!isMobile && (
            <ConversationDetailsSidebar
              conversationId={selectedConversation}
              contactName={selectedConv?.contact?.name}
              isCollapsed={isDetailsSidebarCollapsed}
              onToggleCollapse={() => setIsDetailsSidebarCollapsed(!isDetailsSidebarCollapsed)}
            />
          )}
        </>
      )}
      </div>
    </div>
  );
};

export default WhatsApp;
