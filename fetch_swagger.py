import json
import urllib.request

try:
    url = "https://api.uzapi.com.br/docs/swagger.json"
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
    
    print("Base Path:", data.get('basePath', ''))
    print("\nRelevant Endpoints:")
    paths = list(data.get('paths', {}).keys())
    paths.sort()
    for path in paths:
        if any(k in path.lower() for k in ['send', 'message', 'status', 'connection', 'check']):
            methods = data['paths'][path]
            for method in methods:
                print(f"{method.upper()} {path}")
            
except Exception as e:
    print(f"Error: {e}")
