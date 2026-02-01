import json
import urllib.request

try:
    url = "https://api.uzapi.com.br/docs/swagger.json"
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
    
    with open("endpoints_log.txt", "w") as f:
        f.write(f"Base Path: {data.get('basePath', '')}\n")
        f.write("\nRelevant Endpoints:\n")
        paths = list(data.get('paths', {}).keys())
        paths.sort()
        for path in paths:
            if any(k in path.lower() for k in ['send', 'message', 'status', 'connection', 'check']):
                methods = data['paths'][path]
                for method in methods:
                    f.write(f"{method.upper()} {path}\n")
            
except Exception as e:
    with open("endpoints_log.txt", "w") as f:
        f.write(f"Error: {e}")
