import { createClient } from "@supabase/supabase-js";

/**
 * Camada de dados das salas sobre o Supabase (Postgres + Realtime broadcast).
 * O backend usa a service role key (ignora RLS); o frontend nunca toca nas
 * tabelas — recebe tudo por Realtime ou pela API deste servidor.
 */
export function createSupaStore({ url, serviceRoleKey }) {
  const supa = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function unwrap({ data, error }) {
    if (error) throw new Error(`supabase: ${error.message}`);
    return data;
  }

  return {
    async getRoom(id) {
      return unwrap(await supa.from("rooms").select("*").eq("id", id).maybeSingle());
    },

    async createRoom(row) {
      return unwrap(await supa.from("rooms").insert(row).select().single());
    },

    async setRoomHost(id, participantId) {
      unwrap(await supa.from("rooms").update({ host_participant_id: participantId }).eq("id", id));
    },

    async closeRoom(id) {
      unwrap(await supa.from("rooms").update({ status: "closed" }).eq("id", id));
    },

    async addParticipant(row) {
      return unwrap(await supa.from("participants").insert(row).select().single());
    },

    async getParticipant(id) {
      return unwrap(await supa.from("participants").select("*").eq("id", id).maybeSingle());
    },

    async listParticipants(roomId) {
      return unwrap(
        await supa.from("participants").select("*").eq("room_id", roomId).order("joined_at")
      );
    },

    async insertUtterance(row) {
      return unwrap(await supa.from("utterances").insert(row).select().single());
    },

    async updateUtterance(id, patch) {
      unwrap(
        await supa
          .from("utterances")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id)
      );
    },

    /** Histórico visível para um participante: o que lhe é dirigido + as suas próprias falas. */
    async listUtterances(roomId, me) {
      return unwrap(
        await supa
          .from("utterances")
          .select("*")
          .eq("room_id", roomId)
          .or(`target_language.eq.${me.target_language},from_participant_id.eq.${me.id}`)
          .order("created_at", { ascending: true })
          .limit(500)
      );
    },

    /** Broadcast server-side via endpoint HTTP do Realtime (sem socket). */
    async broadcast(roomId, event, payload) {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          messages: [{ topic: `room:${roomId}`, event, payload, private: false }],
        }),
      });
      if (!res.ok) throw new Error(`realtime broadcast ${res.status}`);
    },
  };
}
