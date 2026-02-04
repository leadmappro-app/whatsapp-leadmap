

# Plano: Ativar Suporte ao WABA-ID para UzAPI

## Resumo
Vou habilitar o campo `waba_id` que já existe no banco de dados e garantir que seja salvo corretamente ao criar instâncias UzAPI. Também vou atualizar os tipos TypeScript e o hook para suportar esse campo.

## Etapas de Implementação

### 1. Atualizar o Hook de Instâncias
**Arquivo:** `src/hooks/whatsapp/useWhatsAppInstances.ts`

Adicionar `waba_id` ao tipo `InstanceInsertWithSecrets` para que o campo seja aceito na criação de instâncias.

### 2. Habilitar o Salvamento do WABA-ID
**Arquivo:** `src/components/settings/AddInstanceDialog.tsx`

Descomentar a linha que salva o `waba_id` ao criar uma instância UzAPI:
```typescript
waba_id: values.provider_type === 'uzapi' ? values.waba_id : undefined,
```

### 3. Atualizar Tipos TypeScript (Opcional - Automático)
O arquivo `src/integrations/supabase/types.ts` será atualizado automaticamente quando o sistema detectar a coluna no banco de dados. Como estamos usando `as any` no insert, isso não é bloqueante.

---

## Seção Técnica

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/whatsapp/useWhatsAppInstances.ts` | Adicionar `waba_id?: string` ao tipo `InstanceInsertWithSecrets` |
| `src/components/settings/AddInstanceDialog.tsx` | Descomentar linha 149 para salvar `waba_id` |

### Mudanças Detalhadas

**useWhatsAppInstances.ts (linha 10-15):**
```typescript
type InstanceInsertWithSecrets = InstanceInsert & {
  api_url: string;
  api_key: string;
  provider_type?: string;
  instance_id_external?: string;
  waba_id?: string;  // <-- ADICIONAR
};
```

**AddInstanceDialog.tsx (linha 149):**
```typescript
// DE:
// waba_id: values.provider_type === 'uzapi' ? values.waba_id : undefined,

// PARA:
waba_id: values.provider_type === 'uzapi' ? values.waba_id : undefined,
```

---

## Validação

Após a implementação:
1. Ir para Configuracoes > Instancias > Adicionar Instancia
2. Selecionar "UzAPI (Gateway Oficial)"
3. Preencher todos os campos incluindo WABA-ID
4. Verificar no banco de dados que o campo `waba_id` foi salvo

---

## Consideracoes Futuras

Se o `waba_id` for necessario em webhooks ou outras operacoes:
- O webhook atual (`evolution-webhook`) busca a instancia por `phone_number_id` (que esta em `instance_id_external`)
- Se a UzAPI enviar `waba_id` nos webhooks, podemos adicionar uma busca alternativa

