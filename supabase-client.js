// This file bootstraps the browser-side Supabase client used by the QuestLine pages.
// It creates a single shared client instance that the library page and game page can reuse.
// The publishable key is safe to expose in frontend code; the secret service-role key is not.
const supabaseUrl = 'https://obbxdederwlzeoudajhi.supabase.co';
const supabasePublishableKey = 'sb_publishable_KS_33te2Kb-5po-N9xFJVA_5OVRuoW0';

window.questLineSupabase = window.supabase
  ? window.supabase.createClient(supabaseUrl, supabasePublishableKey)
  : null;
