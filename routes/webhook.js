const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");

const SESSION_TIMEOUT = 3 * 24 * 60 * 60 * 1000; 

// Webhook Verification
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token && mode === "subscribe" && token === (process.env.VERIFY_TOKEN || "mysecrettoken")) {
      res.status(200).send(challenge);
  } else { res.sendStatus(403); }
});

router.post("/", async (req, res) => {
  // Meta එකට ඉක්මනින් 200 OK යවන්න ඕන, නැත්නම් ඒගොල්ලෝ දිගටම retry කරනවා (Loop එකට හේතුවක්)
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          
          // Status updates (sent, delivered, read) නොසලකා හරින්න
          if (value.statuses) continue; 

          if (value.messages && value.messages.length > 0) {
            const msgObj = value.messages[0];
            const from = msgObj.from; // Customer Number
            const msgType = msgObj.type; 
            const phone_number_id = value.metadata.phone_number_id; // Bot ID
            const display_phone_number = value.metadata.display_phone_number; // Bot Number

            // 🔥 FIX: Bot ගේ නම්බර් එක සහ Customer ගේ නම්බර් එක සමාන නම් නවත්වන්න
            // (Bot තමන්ටම Reply කරගැනීම වැළැක්වීමට)
            const sanitizedBotNum = display_phone_number ? display_phone_number.replace(/\D/g, '') : '';
            if (from === sanitizedBotNum) {
                console.log("🛑 Webhook Ignored: Message from Bot's own number.");
                continue;
            }

            console.log(`📩 Incoming message from: ${from}`);

            // 1. Client (Agent/Owner) සොයාගැනීම
            const { data: clients, error: clientErr } = await supabase.from('users').select('*').eq('phone_number_id', phone_number_id).limit(1);
            const client = clients && clients.length > 0 ? clients[0] : null;

            if (!client) {
                console.log("❌ Webhook: Client not found for phone_number_id:", phone_number_id);
                continue; 
            }

            let msgBody = msgType === "text" ? msgObj.text.body : `📷 ${msgType} Received`;

            // 2. Contact එක සොයාගැනීම හෝ සෑදීම
            let { data: contacts } = await supabase.from('contacts').select('*').eq('phone_number', from).eq('owner_id', client.id).limit(1);
            let contact = contacts && contacts.length > 0 ? contacts[0] : null;
            
            if (!contact) {
                const { data: newContacts } = await supabase.from('contacts').insert([{ 
                    phone_number: from, owner_id: client.id, name: `Guest ${from.slice(-4)}`, unread_count: 1 
                }]).select().limit(1);
                contact = newContacts && newContacts.length > 0 ? newContacts[0] : null;
            } else {
                await supabase.from('contacts').update({ 
                    last_message: msgBody, 
                    last_message_time: new Date().toISOString(), 
                    unread_count: (contact.unread_count || 0) + 1 
                }).eq('id', contact.id);
            }

            if(!contact) continue;

            // 3. Customer ගේ මැසේජ් එක Save කිරීම
            await supabase.from('messages').insert([{ 
                contact_id: contact.id, 
                owner_id: client.id, 
                text: msgBody, 
                sender: "customer", 
                type: msgType 
            }]);

            // 4. Bot Auto-Reply Logic
            const { data: botConfigs } = await supabase.from('bot_configs').select('*').eq('owner_id', client.id).limit(1);
            const botConfig = botConfigs && botConfigs.length > 0 ? botConfigs[0] : null;
            
            if (botConfig && botConfig.is_active && botConfig.replies && botConfig.replies.length > 0) {
                let { data: sessions } = await supabase.from('chat_sessions').select('*').eq('user_id', client.id).eq('phone_number', from).limit(1);
                let session = sessions && sessions.length > 0 ? sessions[0] : null;
                
                if (!session) {
                    const { data: newSessions } = await supabase.from('chat_sessions').insert([{ user_id: client.id, phone_number: from, current_step: 0 }]).select().limit(1);
                    session = newSessions && newSessions.length > 0 ? newSessions[0] : null;
                }

                // Session Reset Logic
                if ((Date.now() - new Date(session.last_active).getTime()) > SESSION_TIMEOUT) session.current_step = 0; 
                // "hi", "start" ආවොත් මුල සිට පටන් ගන්න
                if (msgType === 'text' && (msgBody.toLowerCase() === 'hi' || msgBody.toLowerCase() === 'start')) session.current_step = 0;

                if (session.current_step < botConfig.replies.length) {
                    const reply = botConfig.replies[session.current_step];
                    
                    // මැසේජ් එක යවන්න
                    await sendWhatsAppMessage(client, from, reply);
                    
                    // යැවූ මැසේජ් එක Database එකට දාන්න (is_bot_reply: true සමඟ)
                    await supabase.from('messages').insert([{ 
                        contact_id: contact.id, 
                        owner_id: client.id, 
                        text: reply.text || "Bot Media", 
                        sender: "me", 
                        direction: "outbound", 
                        is_bot_reply: true, 
                        type: reply.mediaType || 'text', 
                        media_url: reply.media || null 
                    }]);

                    // Next Step එකට යන්න
                    await supabase.from('chat_sessions').update({ current_step: session.current_step + 1, last_active: new Date().toISOString() }).eq('id', session.id);
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
    const headers = { Authorization: `Bearer ${client.access_token}`, "Content-Type": "application/json" };
    
    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

    // Media Handling
    if (replyStep.mediaType && replyStep.mediaType !== 'text' && replyStep.media) {
        body.type = replyStep.mediaType; 
        body[replyStep.mediaType] = { link: replyStep.media };
        if(replyStep.text && replyStep.mediaType !== 'audio') { // Audio වලට caption දාන්න බෑ
            body[replyStep.mediaType].caption = replyStep.text;
        }
    } else {
        body.type = "text";
        body.text = { body: replyStep.text };
    }

    await axios.post(url, body, { headers });
  } catch (error) { 
      console.error("❌ Bot Send Failed:", error.response ? error.response.data : error.message); 
  }
};

module.exports = router;