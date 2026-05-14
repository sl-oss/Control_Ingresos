import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://edpiajqfjtpcuwrrrzkc.supabase.co";
const supabaseKey = "sb_publishable_Sne2BmVWP_4NFiYn_e0LWA_i47M9Olr";

export const supabase = createClient(supabaseUrl, supabaseKey);