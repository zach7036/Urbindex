"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.createServiceClient = createServiceClient;
var supabase_js_1 = require("@supabase/supabase-js");
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Client-side Supabase client (uses anon key, respects RLS)
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
// Server-side Supabase client (uses service role key, bypasses RLS)
function createServiceClient() {
    var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, serviceKey);
}
