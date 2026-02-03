# Guia de Setup UzAPI

Este guia explica como configurar o UzAPI como provedor de WhatsApp no sistema.

## Pré-requisitos

1. Conta ativa na [UzAPI](https://uzapi.com.br)
2. Número de telefone WhatsApp Business registrado
3. Credenciais UzAPI:
   - **Username**: Seu nome de usuário na plataforma
   - **Phone Number ID**: ID do número registrado
   - **Token (Bearer)**: Token de autenticação

## Passo a Passo

### 1. Obter Credenciais

Acesse odashboard da UzAPI e anote:

- **Username**: Visível no topo da página ou na URL (`https://api.uzapi.com.br/SEU_USERNAME`)
- **Phone Number ID**: Encontrado nas configurações do número registrado
- **Token**: Gerado em "API Keys" ou "Tokens"

### 2. Configurar Instância

No sistema, vá em **Configurações > Instâncias > Adicionar Instância**:

| Campo | Valor | Exemplo |
|-------|-------|---------|
| **Tipo** | UzAPI (Gateway Oficial) | - |
| **Nome** | Nome descritivo | "WhatsApp Vendas" |
| **Nome da Instância** | Identificador interno | `vendas-uzapi` |
| **Phone Number ID** | ID fornecido pela UzAPI | `942911219636873` |
| **Username UzAPI** | Seu username na plataforma | `cristiannoldin` |
| **Token** | Bearer token da UzAPI | `seu_token_aqui` |

> **💡 Dica**: O campo "Username UzAPI" deve conter apenas seu nome de usuário, não a URL completa! O sistema vai construir automaticamente a URL `https://api.uzapi.com.br/{seu-username}`.

### 3. Testar Conexão

Clique em "Testar Conexão". Você verá:
- ✅ **Sucesso**: "UzAPI configured successfully"
- ❌ **Erro**: Verifique credenciais

### 4. Configurar Webhook

Após salvar a instância, copie a **URL do Webhook** exibida e configure no painel UzAPI:

**URL do Webhook:**
```
{SUPABASE_URL}/functions/v1/evolution-webhook
```

**Eventos a ativar:**
- ✅ Mensagens recebidas (`message`)
- ⚠️ Status de mensagens (opcional, não implementado ainda)

### 5. Conectar WhatsApp

No painel UzAPI, vincule seu número WhatsApp Business:
1. Escaneie o QR Code
2. Aguarde confirmação de conexão
3. A instância aparecerá como "Conectada" no sistema

## Diferenças vs Evolution API

| Recurso | UzAPI | Evolution API |
|---------|-------|---------------|
| **Configuração** | Username + Phone ID | URL + Instance Name |
| **Autenticação** | Bearer Token | API Key header |
| **Webhook** | Formato próprio | messages.upsert |
| **Mídia** | Links diretos | Download + upload |

## Troubleshooting

### "Phone Number ID é obrigatório"
- Verifique se preencheu o campo **Phone Number ID** corretamente
- Confirme que o número está ativo no painel UzAPI

### "Token inválido ou expirado"
- Regere o token no painel UzAPI
- Atualize a instância com o novo token

### "Mensagens não aparecem"
- Confirme que o webhook está configurado no painel UzAPI
- Verifique logs da edge function:
  ```bash
  supabase functions logs evolution-webhook --project-ref <ref>
  ```
- Procure por `[evolution-webhook] UzAPI payload detected`

### "Instance not found" nos logs
- O `Phone Number ID` na instância deve bater exatamente com o enviado pelo webhook
- Verifique se `provider_type` está como `uzapi` no banco

## Limitações Atuais

- ❌ Status de mensagens enviadas (lido/entregue) não processado ainda
- limited✅ Mensagens recebidas funcionam completamente
- ✅ Todos tipos de mídia suportados (imagem, áudio, vídeo, documento)

## Recursos Avançados

### Verificar Logs

Logs da UzAPI mostram:
```
[evolution-webhook] UzAPI payload detected: message
[evolution-webhook] UzAPI instance found: vendas-uzapi
[evolution-webhook] Normalized to Evolution format
```

### Consultar Mensagens no Banco

```sql
SELECT * FROM whatsapp_messages 
WHERE conversation_id IN (
  SELECT id FROM whatsapp_conversations 
  WHERE instance_id IN (
    SELECT id FROM whatsapp_instances 
    WHERE provider_type = 'uzapi'
  )
)
ORDER BY created_at DESC;
```

## Suporte

Dúvidas sobre:
- **Credenciais UzAPI**: Contate suporte da UzAPI
- **Configuração no sistema**: Consulte documentação técnica
- **Webhooks não funcionando**: Verifique logs e configuração
