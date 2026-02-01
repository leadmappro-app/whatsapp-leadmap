import json
import urllib.request

try:
    url = "https://api.uzapi.com.br/docs/swagger.json"
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
    
    with open("uzapi_details.txt", "w") as f:
        path = "/{username}/{version}/{phone_number_id}/messages"
        if path in data['paths']:
            post_method = data['paths'][path].get('post')
            if post_method:
                f.write("Parameters for POST " + path + ":\n")
                for param in post_method.get('parameters', []):
                    f.write(f"- Name: {param['name']}, In: {param['in']}, Required: {param.get('required', False)}\n")
                
                f.write("\nRequest Body:\n")
                if 'requestBody' in post_method:
                     f.write(json.dumps(post_method['requestBody'], indent=2))
        else:
            f.write(f"Path {path} not found in Swagger.\n")
            f.write("Available paths:\n")
            for p in data['paths'].keys():
                if 'message' in p:
                    f.write(f"{p}\n")

except Exception as e:
    with open("uzapi_details.txt", "w") as f:
        f.write(f"Error: {e}")
