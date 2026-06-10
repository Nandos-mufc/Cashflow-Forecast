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
    .select("id, display_name, created_at, updated_at")
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
    .update({ display_name: displayName })
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

// Save the model state. Also refreshes the client's display name from the
// plan's people, so the dashboard list stays meaningful.
export async function savePlan(planId, clientId, data, name) {
  const patch = { data };
  if (name) patch.name = name;
  const { error } = await supabase.from("plans").update(patch).eq("id", planId);
  if (error) throw error;
  if (clientId) {
    const label = planLabel(data);
    if (label) await supabase.from("clients").update({ display_name: label }).eq("id", clientId);
  }
}

export async function deletePlan(id) {
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) throw error;
}

export async function renamePlan(id, name) {
  const { error } = await supabase.from("plans").update({ name }).eq("id", id);
  if (error) throw error;
}
