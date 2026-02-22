import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://zrzvdcjfieymqhvxzwca.supabase.co"; // твой Project URL
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyenZkY2pmaWV5bXFodnh6d2NhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MzcxNiwiZXhwIjoyMDg3MzI5NzE2fQ.gL8RnAc_Ye41f5vZIGQQBkQtPlMlPDGoZtkEE4xvNlk"; // твой anon ключ

export const supabase = createClient(supabaseUrl, supabaseKey);