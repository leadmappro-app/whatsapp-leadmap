import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUazAPIConfig } from "@/hooks/useUazAPIConfig";
import { Zap, Save, Loader2, Globe, ShieldCheck, User } from "lucide-react";

export function UazAPIConfig() {
  const { config, isLoading, updateConfig } = useUazAPIConfig();
  const [adminToken, setAdminToken] = useState("");
  const [username, setUsername] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.uazapi.com");

  useEffect(() => {
    if (config) {
      setAdminToken(config.adminToken);
      setUsername(config.username);
      setBaseUrl(config.baseUrl);
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate({
      adminToken,
      username,
      baseUrl
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle>Configuração Global UazAPI</CardTitle>
          </div>
          <CardDescription>
            Configure as credenciais administrativas da UazAPI. Estas chaves são usadas para criar novas instâncias para os usuários.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="admin-token" className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Admin Token
              </Label>
              <Input
                id="admin-token"
                type="password"
                placeholder="Insira o Admin Token da UazAPI"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Token mestre usado para gerenciar deploys no seu tenant.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Username (Tenant)
              </Label>
              <Input
                id="username"
                placeholder="Seu usuário na UazAPI"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O identificador do seu ambiente na UazAPI.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base-url" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Base URL
              </Label>
              <Input
                id="base-url"
                placeholder="https://api.uazapi.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A URL base da API (padrão: https://api.uazapi.com).
              </p>
            </div>
          </div>

          <div className="pt-4 flex justify-between gap-4">
            <Button
              variant="outline"
              onClick={() => updateConfig.testConfig.mutate()}
              disabled={updateConfig.testConfig.isPending || !adminToken}
            >
              {updateConfig.testConfig.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Testar Conexão
            </Button>

            <Button 
              onClick={handleSave} 
              disabled={updateConfig.isPending}
              className="min-w-[120px]"
            >
              {updateConfig.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
