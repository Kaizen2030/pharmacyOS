import { useEffect, useState } from 'react'
import supabase from '../supabase'
import { usePharmacy } from '../context'

async function fetchGeminiResponse(prompt, imageBase64 = null, mimeType = null) {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { prompt, imageBase64, mimeType }
  })
  if (error) throw new Error(error.message)
  return data
}

export default function AI() {
  const { pharmacyId, pharmacyName } = usePharmacy()

  const [messages, setMessages] = useState([
    {
      type: 'bot',
      text: `Hello! I'm your AI Drug Advisor for **${pharmacyName || 'your pharmacy'}**.\n\nAsk me about medication guidance, drug interactions, dosing, or upload an image for inspection.`
    }
  ])
  const [input, setInput] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [inventory, setInventory] = useState([])

  useEffect(() => {
    if (pharmacyId) fetchInventory()
  }, [pharmacyId])

  async function fetchInventory() {
    const { data } = await supabase
      .from('inventory')
      .select('drug_name, quantity')
      .eq('pharmacy_id', pharmacyId)
      .limit(80)
    setInventory(data || [])
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSelectedImage(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const sendMessage = async (customInput) => {
    const question = customInput || input
    if ((!question.trim() && !selectedImage) || loading) return

    const userMsg = { type: 'user', text: question || 'Analyze this image', image: imagePreview }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const systemPrompt = `You are a professional pharmacist AI for ${pharmacyName || 'PharmacyOS'} in Kenya. 
Give complete, detailed, and well-structured answers. Do not cut off mid-sentence.`

      const fullPrompt = `${systemPrompt}\n\n${question || 'Identify this medicine and give full details.'}`

      const data = await fetchGeminiResponse(
        fullPrompt,
        selectedImage && imagePreview ? imagePreview.split(',')[1] : null,
        selectedImage?.type || null
      )

      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                     "Sorry, I couldn't generate a response."

      setMessages(prev => [...prev, { type: 'bot', text: aiText.trim() }])
    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, {
        type: 'bot',
        text: '⚠️ Error: ' + (err.message || 'Failed to connect to AI.')
      }])
    }

    setSelectedImage(null)
    setImagePreview(null)
    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <h2 style={styles.title}>AI Drug Advisor</h2>
        <span style={styles.powered}>Automated medication guidance for pharmacy staff</span>
      </div>

      <div style={styles.chatWrap}>
        <div style={styles.chatMessages}>
          {messages.map((msg, i) => (
            <div key={i} style={msg.type === 'user' ? styles.msgUser : styles.msgBot}>
              {msg.type === 'bot' && <div style={styles.botLabel}>PharmacyOS AI </div>}
              {msg.image && <img src={msg.image} alt="uploaded" style={styles.chatImage} />}
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{msg.text}</div>
            </div>
          ))}
          {loading && <div style={styles.msgBot}><div style={styles.botLabel}>PharmacyOS AI · Gemini</div>Thinking...</div>}
        </div>

        {imagePreview && (
          <div style={styles.imagePreview}>
            <img src={imagePreview} alt="preview" style={styles.previewImg} />
            <div style={{ fontSize: '11px', color: '#666' }}>{selectedImage?.name}</div>
            <button onClick={() => { setSelectedImage(null); setImagePreview(null) }} style={styles.removeBtn}>× Remove</button>
          </div>
        )}

        <div style={styles.chatInputRow}>
          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} id="image-upload" />
          <label htmlFor="image-upload" style={styles.uploadBtn}>📸</label>
          <input
            style={styles.chatInput}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && sendMessage()}
            placeholder="Ask about drugs, dosages, interactions..."
            disabled={loading}
          />
          <button style={{ ...styles.btnPrimary, opacity: loading ? 0.6 : 1 }} onClick={() => sendMessage()} disabled={loading}>
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>

      <div style={styles.quickQueries}>
        <div style={styles.cardTitle}>Quick queries</div>
        <div style={styles.quickButtons}>
          {[
            ['Dosing guidance', 'What is the typical adult dose for a common antibiotic?'],
            ['Drug interactions', 'Which medicines commonly interact with anticoagulants?'],
            ['Pediatric use', 'What should I consider when dispensing a drug to children?'],
            ['Chronic therapy', 'What side effects should I watch for with long-term acid reducers?'],
          ].map(([label, question]) => (
            <button key={label} style={styles.quickBtn} onClick={() => sendMessage(question)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '18px 22px', flex: 1, overflowY: 'auto' },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#111' },
  powered: { fontSize: '11px', color: '#1D9E75', fontWeight: '500' },
  chatWrap: { background: '#fff', border: '1px solid #e8ebe8', borderRadius: '10px', padding: '14px', height: '420px', display: 'flex', flexDirection: 'column' },
  chatMessages: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '10px' },
  msgUser: { alignSelf: 'flex-end', background: '#0F6E56', color: '#fff', padding: '10px 14px', borderRadius: '10px 10px 2px 10px', maxWidth: '75%', fontSize: '13px' },
  msgBot: { alignSelf: 'flex-start', background: '#f9fbf9', border: '1px solid #e8ebe8', padding: '10px 14px', borderRadius: '10px 10px 10px 2px', maxWidth: '80%', fontSize: '13px' },
  botLabel: { fontSize: '10px', color: '#1D9E75', fontWeight: '600', marginBottom: '4px' },
  chatImage: { maxWidth: '200px', borderRadius: '8px', marginBottom: '8px', display: 'block' },
  chatInputRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  chatInput: { flex: 1, padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px' },
  btnPrimary: { background: '#0F6E56', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' },
  uploadBtn: { padding: '9px 13px', background: '#f0f2f0', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', border: '1px solid #ddd' },
  imagePreview: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '8px 12px', background: '#f9fbf9', borderRadius: '8px', border: '1px dashed #ccc' },
  previewImg: { maxHeight: '70px', borderRadius: '6px' },
  removeBtn: { background: '#FCEBEB', color: '#A32D2D', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', marginLeft: 'auto' },
  quickQueries: { marginTop: '16px' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: '#111', marginBottom: '8px' },
  quickButtons: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  quickBtn: { background: '#fff', color: '#0F6E56', border: '1px solid #0F6E56', padding: '6px 14px', borderRadius: '9999px', fontSize: '12px', cursor: 'pointer' }
}
