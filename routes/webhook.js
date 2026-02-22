const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");

const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000; 

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token && mode === "subscribe" && token === (process.env.VERIFY_TOKEN || "mysecrettoken")) {
      res.status(200).send(challenge);
  } else { res.sendStatus(403); }
});

router.post("/", async (req, res) => {
  res.status(200).send("EVENT_RECEIVED");
  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (value.statuses) continue; 

          if (value.messages && value.messages.length > 0) {
            const msgObj = value.messages[0];
            const from = msgObj.from;
            const msgType = msgObj.type; 
            const phone_number_id = value.metadata.phone_number_id;

            console.log(`📩 Incoming message from: ${from}`);

            // Client හොයනවා
            const { data: client, error: clientErr } = await supabase.from('users').select('*').eq('phone_number_id', phone_number_id).single();
            if (!client) {
                console.log("❌ Webhook: Client not found!");
                continue; 
            }

            let msgBody = msgType === "text" ? msgObj.text.body : `📷 ${msgType} Received`;

            // Contact හොයනවා
            let { data: contact } = await supabase.from('contacts').select('*').eq('phone_number', from).eq('owner_id', client.id).single();
            
            if (!contact) {
                const { data: newContact, error: insertErr } = await supabase.from('contacts').insert([{ 
                    phone_number: from, owner_id: client.id, name: `Guest ${from.slice(-4)}`, unread_count: 1 
                }]).select().single();
                
                if (insertErr) console.log("❌ Webhook Contact Error:", insertErr);
                contact = newContact;
            } else {
                await supabase.from('contacts').update({ 
                    last_message: msgBody, 
                    last_message_time: new Date().toISOString(), 
                    unread_count: (contact.unread_count || 0) + 1 
                }).eq('id', contact.id);
            }

            // Message එක Save කරනවා
            const { error: msgErr } = await supabase.from('messages').insert([{ 
                contact_id: contact.id, 
                owner_id: client.id, 
                text: msgBody, 
                sender: "customer", 
                type: msgType 
            }]);

            if (msgErr) console.log("❌ Webhook Message Error:", msgErr);
            else console.log("✅ Webhook Message Saved Successfully!");

            // Bot Logic
            const { data: botConfig } = await supabase.from('bot_configs').select('*').eq('owner_id', client.id).single();
            
            if (botConfig && botConfig.is_active && botConfig.replies && botConfig.replies.length > 0) {
                let { data: session } = await supabase.from('chat_sessions').select('*').eq('user_id', client.id).eq('phone_number', from).single();
                
                if (!session) {
                    const { data: newSession } = await supabase.from('chat_sessions').insert([{ user_id: client.id, phone_number: from, current_step: 0 }]).select().single();
                    session = newSession;
                }

                if ((Date.now() - new Date(session.last_active).getTime()) > SESSION_TIMEOUT) session.current_step = 0; 
                if ((msgObj.text?.body || "").toLowerCase().match(/hi|start|menu/)) session.current_step = 0;

                if (session.current_step < botConfig.replies.length) {
                    const reply = botConfig.replies[session.current_step];
                    
                    await sendWhatsAppMessage(client, from, reply);
                    await supabase.from('messages').insert([{ contact_id: contact.id, owner_id: client.id, text: reply.text || "Bot Reply", sender: "me", is_bot_reply: true }]);

                    await supabase.from('chat_sessions').update({ current_step: session.current_step + 1, last_active: new Date().toISOString() }).eq('id', session.id);
                } else {
                    await supabase.from('chat_sessions').update({ last_active: new Date().toISOString() }).eq('id', session.id);
                }
            }
          }
        }
      }
    }
  } catch (err) { console.error("❌ Webhook Fatal Error:", err.message); }
});

const sendWhatsAppMessage = async (client, to, replyStep) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${client.phone_number_id}/messages`;
    const token = client.access_token;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to, type: "text", text: { body: replyStep.text } };
    await axios.post(url, body, { headers });
  } catch (error) { console.error("❌ Bot Send Failed"); }
};

module.exports = router;