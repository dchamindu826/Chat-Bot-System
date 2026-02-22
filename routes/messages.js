const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

router.get("/:contactId", verifyToken, async (req, res) => {
  try {
    await supabase.from('contacts').update({ unread_count: 0 }).eq('id', req.params.contactId);
    
    const { data: messages, error } = await supabase.from('messages').select('*').eq('contact_id', req.params.contactId).order('created_at', { ascending: true });
    if (error) throw error;
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post("/send", verifyToken, async (req, res) => {
  const { contactId, to, text, type, mediaUrl } = req.body; 

  try {
    const { data: contact } = await supabase.from('contacts').select('*').eq('id', contactId).single();
    if (!contact) return res.status(404).json({ message: "Contact not found" });

    const { data: client } = await supabase.from('users').select('*').eq('id', contact.owner_id).single();
    if (!client || !client.phone_number_id) return res.status(500).json({ message: "Client Config Error" });

    const url = `https://graph.facebook.com/v17.0/${client.phone_number_id}/messages`;

    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

    if (['image', 'video', 'document', 'audio'].includes(type)) {
        body.type = type;
        body[type] = { link: mediaUrl };
        if (type !== 'audio' && text) body[type].caption = text;
    } else {
        body.type = "text";
        body.text = { body: text };
    }

    await axios.post(url, body, {
      headers: { Authorization: `Bearer ${client.access_token}`, "Content-Type": "application/json" }
    });

    const { data: newMessage } = await supabase.from('messages').insert([{
        contact_id: contactId,
        text: text || "Media File", 
        type: type || "text",
        sender: "me",
        owner_id: contact.owner_id, 
        direction: "outbound",
        media_url: mediaUrl
    }]).select().single();

    await supabase.from('contacts').update({
        last_message: text || `Sent ${type}`,
        last_message_time: new Date().toISOString()
    }).eq('id', contactId);

    res.status(200).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;