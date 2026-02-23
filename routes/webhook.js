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
  console.log("🔥 WEBHOOK HIT! Meta is sending data...");
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

            // 1. Client හොයනවා 
            const { data: clients, error: clientErr } = await supabase.from('users').select('*').eq('phone_number_id', phone_number_id).limit(1);
            if (clientErr) console.log("⚠️ DB Search Error:", clientErr.message);
            
            const client = clients && clients.length > 0 ? clients[0] : null;

            if (!client) {
                console.log("❌ Webhook: Client not found for phone_number_id:", phone_number_id);
                continue; 
            }

            let msgBody = msgType === "text" ? msgObj.text.body : `📷 ${msgType} Received`;

            // 2. Contact හොයනවා 
            let { data: contacts } = await supabase.from('contacts').select('*').eq('phone_number', from).eq('owner_id', client.id).limit(1);
            let contact = contacts && contacts.length > 0 ? contacts[0] : null;
            
            if (!contact) {
                const { data: newContacts, error: insertErr } = await supabase.from('contacts').insert([{ 
                    phone_number: from, owner_id: client.id, name: `Guest ${from.slice(-4)}`, unread_count: 1 
                }]).select().limit(1);
                
                if (insertErr) console.log("❌ Webhook Contact Error:", insertErr);
                contact = newContacts && newContacts.length > 0 ? newContacts[0] : null;
            } else {
                await supabase.from('contacts').update({ 
                    last_message: msgBody, 
                    last_message_time: new Date().toISOString(), 
                    unread_count: (contact.unread_count || 0) + 1 
                }).eq('id', contact.id);
            }

            if(!contact) continue;

            // 3. Customer එවපු Message එක DB එකේ Save කරනවා
            const { error: msgErr } = await supabase.from('messages').insert([{ 
                contact_id: contact.id, 
                owner_id: client.id, 
                text: msgBody, 
                sender: "customer", 
                type: msgType 
            }]);

            if (msgErr) console.log("❌ Webhook Message Error:", msgErr);
            else console.log("✅ Webhook Message Saved Successfully!");

            // 4. Bot Auto Reply Logic
            const { data: botConfigs, error: botErr } = await supabase.from('bot_configs').select('*').eq('owner_id', client.id).limit(1);
            
            if (botErr) {
                console.log("❌ Error fetching bot config:", botErr.message);
            }
            
            const botConfig = botConfigs && botConfigs.length > 0 ? botConfigs[0] : null;
            
            console.log("🤖 Found Bot Config:", botConfig ? "Yes" : "No");
            if (botConfig) {
                 console.log("   - is_active:", botConfig.is_active);
                 console.log("   - replies length:", botConfig.replies ? botConfig.replies.length : 0);
            }
            
            if (botConfig && botConfig.is_active && botConfig.replies && botConfig.replies.length > 0) {
                let { data: sessions } = await supabase.from('chat_sessions').select('*').eq('user_id', client.id).eq('phone_number', from).limit(1);
                let session = sessions && sessions.length > 0 ? sessions[0] : null;
                
                if (!session) {
                    const { data: newSessions } = await supabase.from('chat_sessions').insert([{ user_id: client.id, phone_number: from, current_step: 0 }]).select().limit(1);
                    session = newSessions && newSessions.length > 0 ? newSessions[0] : null;
                }

                if(!session) {
                    console.log("❌ Could not create/find chat session.");
                    continue; 
                }

                if ((Date.now() - new Date(session.last_active).getTime()) > SESSION_TIMEOUT) session.current_step = 0; 
                if ((msgObj.text?.body || "").toLowerCase().match(/hi|start|menu/)) session.current_step = 0;

                if (session.current_step < botConfig.replies.length) {
                    const reply = botConfig.replies[session.current_step];
                    
                    await sendWhatsAppMessage(client, from, reply);
                    
                    // 🔥 FIXED: මේ කොටස තමයි Chat History එකේ Bot Msg එක පෙන්නන්න හදලා තියෙන්නේ
                    const { error: botInsertErr } = await supabase.from('messages').insert([{ 
                        contact_id: contact.id, 
                        owner_id: client.id, 
                        text: reply.text || "Bot Media", 
                        sender: "me", 
                        direction: "outbound", // මේක අනිවාර්යයි Frontend එකට 
                        is_bot_reply: true, 
                        type: reply.mediaType || 'text', 
                        content: reply.media || null 
                    }]);

                    if (botInsertErr) {
                        console.log("❌ Bot Message DB Save Error:", botInsertErr.message);
                    } else {
                        console.log("✅ Bot Message Saved to Database perfectly!");
                    }

                    await supabase.from('chat_sessions').update({ current_step: session.current_step + 1, last_active: new Date().toISOString() }).eq('id', session.id);
                } else {
                    await supabase.from('chat_sessions').update({ last_active: new Date().toISOString() }).eq('id', session.id);
                }
            } else {
                console.log("⚠️ Bot is not active or no replies configured for this client.");
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
    
    let body = { 
        messaging_product: "whatsapp", 
        recipient_type: "individual", 
        to: to 
    };

    if (replyStep.mediaType && replyStep.mediaType !== 'text' && replyStep.media) {
        body.type = replyStep.mediaType; 
        body[replyStep.mediaType] = { link: replyStep.media };
        if(replyStep.text && replyStep.mediaType !== 'audio') {
            body[replyStep.mediaType].caption = replyStep.text;
        }
    } else {
        body.type = "text";
        body.text = { body: replyStep.text };
    }

    await axios.post(url, body, { headers });
    console.log(`✅ Bot Reply Sent Successfully to ${to} 🚀`);
  } catch (error) { 
      console.error("❌ Bot Send Failed:", error.response ? error.response.data : error.message); 
  }
};

module.exports = router;