INSERT INTO project_config (key, value) VALUES ('uazapi_base_url', 'https://api.uzapi.com.br'), ('uazapi_admin_token', '') ON CONFLICT (key) DO NOTHING;
