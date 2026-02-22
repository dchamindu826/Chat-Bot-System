const router = require("express").Router();
const axios = require("axios");
const supabase = require("../supabase");
const { verifyToken } = require("../verifyToken");

router.get("/:contactId", verifyToken, async (req, res) => {
  try {
    await supabase.from('contacts').update({ unread_count: 0 }).eq('id', req.params.contactId);
    
    const { data: messages, error } = await supabase.from('messages').select('*').eq('contact_id', req.params.contactId).order('created_at', { ascending: true });
    if (error) throw error;

    // 🔥 React එකට තේරෙන්න පරණ Mongoose විදිහට Map කරනවා 
    const formattedMessages = messages.map(m => ({
        _id: m.id,
        contactId: m.contact_id,
        ownerId: m.owner_id,
        text: m.text,
        mediaUrl: m.media_url,
        type: m.type,
        sender: m.sender,
        isBotReply: m.is_bot_reply,
        direction: m.direction,
        createdAt: m.created_at
    }));

    res.status(200).json(formattedMessages);
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

    const url = `https://graph.facebook.com/v17.0/${client.phone_number_id}/messages`;
    let body = { messaging_product: "whatsapp", recipient_type: "individual", to: to };

    if (['image', 'video', 'document', 'audio'].includes(type)) {
        body.type = type;
        body[type] = { link: mediaUrl };
        if (type !== 'audio' && text) body[type].caption = text;
    } else {
        body.type = "text"; body.text = { body: text };
    }

    await axios.post(url, body, { headers: { Authorization: `Bearer ${client.access_token}` } });

    const { data: newMessage } = await supabase.from('messages').insert([{
        contact_id: contactId,
        owner_id: contact.owner_id,
        text: text || "Media File", 
        type: type || "text",
        sender: "me",
        direction: "outbound",
        media_url: mediaUrl
    }]).select().single();

    await supabase.from('contacts').update({
        last_message: text || `Sent ${type}`,
        last_message_time: new Date().toISOString()
    }).eq('id', contactId);

    // 🔥 යවන මැසේජ් එකත් Map කරලා යවනවා
    res.status(200).json({
        _id: newMessage.id,
        contactId: newMessage.contact_id,
        text: newMessage.text,
        sender: newMessage.sender,
        createdAt: newMessage.created_at
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;