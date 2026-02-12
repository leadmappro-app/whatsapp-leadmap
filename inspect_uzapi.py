import json
import urllib.request

try:
    with open("/root/.openclaw/workspace/whatsappweb-github/uzapi-swagger.json", "r") as f:
        data = json.load(f)
    
    with open("uzapi_details.txt", "w") as f:
        path = "/{username}/{version}/instance/add"
        if path in data['paths']:
            post_method = data['paths'][path].get('post')
            if post_method:
                f.write("Parameters for POST " + path + ":\n")
                f.write("\nResponses:\n")
                f.write(json.dumps(post_method['responses'], indent=2))
                
                f.write("\nSchemas:\n")
                schemas = data.get('components', {}).get('schemas', {})
                f.write(json.dumps(schemas, indent=2))
        else:
            f.write(f"Path {path} not found in Swagger.\n")
            f.write("Available paths:\n")
            for p in data['paths'].keys():
                if 'message' in p:
                    f.write(f"{p}\n")

except Exception as e:
    with open("uzapi_details.txt", "w") as f:
        f.write(f"Error: {e}")
