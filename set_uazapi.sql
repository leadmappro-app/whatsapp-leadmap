INSERT INTO project_config (key, value) VALUES 
('uazapi_base_url', 'https://leadmapuazapicom.uazapi.com'), 
('uazapi_admin_token', 'SQwMrJmF4OEgkfOjUvhgxZn6gYRZ8akzOczPhFcCboOwqkkGrD'),
('uazapi_username', 'leadmapuazapicom') 
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
