import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UazAPIConfigData {
  adminToken: string;
  username: string;
  baseUrl: string;
}

export function useUazAPIConfig() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["uazapi-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_config")
        .select("key, value")
        .in("key", ["uazapi_admin_token", "uazapi_username", "uazapi_base_url"]);

      if (error) throw error;

      return {
        adminToken: data.find((c) => c.key === "uazapi_admin_token")?.value || "",
        username: data.find((c) => c.key === "uazapi_username")?.value || "",
        baseUrl: data.find((c) => c.key === "uazapi_base_url")?.value || "https://api.uazapi.com",
      } as UazAPIConfigData;
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (newData: UazAPIConfigData) => {
      const updates = [
        { key: "uazapi_admin_token", value: newData.adminToken },
        { key: "uazapi_username", value: newData.username },
        { key: "uazapi_base_url", value: newData.baseUrl },
      ];

      for (const item of updates) {
        const { error } = await supabase
          .from("project_config")
          .upsert({ key: item.key, value: item.value }, { onConflict: "key" });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uazapi-config"] });
      toast.success("Configurações da UazAPI atualizadas com sucesso");
    },
    onError: (error) => {
      console.error("Erro ao atualizar UazAPI config:", error);
      toast.error("Erro ao salvar configurações");
    },
  });

  return {
    config,
    isLoading,
    updateConfig,
    testConfig: useMutation({
      mutationFn: async () => {
        const { data, error } = await supabase.functions.invoke("uazapi-manager", {
          body: { action: "test-config" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return data;
      },
      onSuccess: (data) => {
        toast.success(data.message || "Configuração validada com sucesso!");
      },
      onError: (error: any) => {
        toast.error(`Falha na validação: ${error.message}`);
      },
    }),
  };
}
