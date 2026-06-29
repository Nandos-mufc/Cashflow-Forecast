import { supabase } from "./supabaseClient";
import { emptyPlan, planLabel } from "./defaultPlan";

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in");
  return data.user.id;
}

/* ----------------------------- clients ----------------------------- */

export async function listClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("id, display_name, created_at, updated_at, summary")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getClient(id) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, display_name, created_at, updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createClient(displayName = "New client") {
  const adviser_id = await currentUserId();
  const { data, error } = await supabase
    .from("clients")
    .insert({ adviser_id, display_name: displayName })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameClient(id, displayName) {
  const { error } = await supabase
    .from("clients")
    .update({ display_name: displayName, name_locked: true })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteClient(id) {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error; // plans cascade-delete via the foreign key
}

/* ------------------------------ plans ------------------------------ */

export async function listPlans(clientId) {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, updated_at")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPlan(planId) {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, data, client_id, updated_at")
    .eq("id", planId)
    .single();
  if (error) throw error;
  return data;
}

export async function createPlan(clientId, name = "Base plan", data = emptyPlan()) {
  const adviser_id = await currentUserId();
  const { data: row, error } = await supabase
    .from("plans")
    .insert({ client_id: clientId, adviser_id, name, data })
    .select()
    .single();
  if (error) throw error;
  return row;
}

// Open a client's working plan, creating a blank one the first time.
export async function getOrCreateBasePlan(clientId) {
  const plans = await listPlans(clientId);
  if (plans.length) return getPlan(plans[0].id);
  const created = await createPlan(clientId);
  return getPlan(created.id);
}

// Save the model state. By default the client's display name auto-derives from the
// plan's people so the dashboard list stays meaningful — but never overwrite a name the
// adviser set by hand (name_locked), so a manual rename sticks.
//
// `data` may carry a derived `summary` (health tone + net-worth sparkline) produced by the
// engine. We split it OFF the plan blob so plans.data stays pure model input, and write it to
// the client row so the dashboard can render a health dot + sparkline cheaply, without
// re-running every projection on load. Absent/old payloads simply skip the summary write.
export async function savePlan(planId, clientId, data, name) {
  const { summary, ...planData } = data || {};
  const patch = { data: planData };
  if (name) patch.name = name;
  const { error } = await supabase.from("plans").update(patch).eq("id", planId);
  if (error) throw error;
  if (clientId) {
    const label = planLabel(planData);
    if (label) {
      await supabase
        .from("clients")
        .update({ display_name: label })
        .eq("id", clientId)
        .eq("name_locked", false);
    }
    if (summary) {
      await supabase.from("clients").update({ summary }).eq("id", clientId);
    }
  }
}

export async function deletePlan(id) {
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------ duplicate client ------------------------------ */

// Deep-clones a client and their active (first) plan into a new client row.
// Returns the new client so the caller can navigate straight into it.
export async function duplicateClient(sourceClientId, newName) {
  const adviser_id = await currentUserId();

  // 1. Fetch the source client's first plan
  const { data: plans, error: plansErr } = await supabase
    .from("plans")
    .select("name, data")
    .eq("client_id", sourceClientId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (plansErr) throw plansErr;

  const sourcePlan = plans?.[0] ?? null;

  // 2. Create the new client row (name_locked false so auto-label can overwrite if desired)
  const { data: newClient, error: clientErr } = await supabase
    .from("clients")
    .insert({ adviser_id, display_name: newName, name_locked: false })
    .select()
    .single();
  if (clientErr) throw clientErr;

  // 3. Copy the plan data into a new plan row under the new client
  const planData = sourcePlan?.data ?? emptyPlan();
  const planName = sourcePlan?.name ?? "Base plan";
  const { error: planErr } = await supabase
    .from("plans")
    .insert({ client_id: newClient.id, adviser_id, name: planName, data: planData });
  if (planErr) throw planErr;

  return newClient;
}

export async function renamePlan(id, name) {
  const { error } = await supabase.from("plans").update({ name }).eq("id", id);
  if (error) throw error;
}
