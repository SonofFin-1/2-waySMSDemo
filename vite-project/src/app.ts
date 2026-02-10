type Message = {
  id: string
  text: string
  sender: 'bot' | 'user'
  timestamp: Date
  options?: string[]
}

type ConversationState = 
  | 'initial'
  | 'calling'
  | 'call_accepted'
  | 'call_declined'
  | 'asking_if_wants_call'
  | 'waiting_for_response'
  | 'scheduling_time'
  | 'time_scheduled'
  | 'asking_better_time'
  | 'asking_after_cancel'
  | 'followup_next_day'
  | 'unknown'
  | 'ended'
  // Confirm visit workflow states
  | 'confirm_visit_initial'
  | 'confirm_visit_waiting'
  | 'confirm_visit_confirmed'
  | 'confirm_visit_reschedule_question'
  | 'confirm_visit_reschedule_waiting'
  | 'confirm_visit_reschedule_selecting_time'
  | 'confirm_visit_cancelled'
  | 'confirm_visit_dnc'

let currentState: ConversationState = 'initial'
let scheduledDateTime: Date | null = null
const messages: Message[] = []
let activeTab: 'chat' | 'dialogue' = 'chat'
let isAfter24HourFollowup: boolean = false
let userHasStopped: boolean = false
let selectedWorkflow: string = 'webform'
let selectedVersion: string = 'A'
let aiEnabled: boolean = false

// Call control states
let isMuted: boolean = false
let isSpeakerOn: boolean = false
let isKeypadVisible: boolean = false
let keypadInput: string = ''

// Phone display mode

let callStartTime: Date | null = null
let callDurationInterval: number | null = null

// First message shown when any conversation starts on any view
const ADT_INTRO_MESSAGE = "Hi, I'm ADT's Digital Assistant powered by AI! This chat may be monitored or recorded. Msg&DataRatesApply. STOP2end"

// AI Categorization Types
type ResponseCategory = 'Yes' | 'Call at a different time' | 'No' | '24 hours later (No response)' | 'Do not contact' | 'Unknown message'

/**
 * Categorizes user text input using OpenAI API
 * Falls back to pattern matching if API call fails
 */
async function categorizeUserResponse(userText: string): Promise<ResponseCategory> {
  const text = userText.toLowerCase().trim()
  
  // If empty or very short, treat as no response
  if (!text || text.length < 2) {
    return '24 hours later (No response)'
  }
  
  // Check if AI is enabled - if not, skip API call and use pattern matching
  if (!aiEnabled) {
    console.log('⚠️ AI is disabled - using pattern matching')
    const fallbackCategory = categorizeUserResponsePatternMatching(userText)
    console.log('🔄 Using pattern matching category:', fallbackCategory)
    return fallbackCategory
  }
  
  // Try OpenAI API first
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  console.log('API Key loaded:', apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No')
  
  if (apiKey && apiKey !== 'YOUR_API_KEY') {
    try {
      console.log('🤖 Calling OpenAI API')
      console.log('📝 User input received:', JSON.stringify(userText))
      console.log('📝 User input length:', userText.length)
      console.log('📝 User input trimmed:', JSON.stringify(userText.trim()))
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a text classifier for customer service SMS responses. Your task is to carefully read the user's message and categorize it into ONE of these EXACT categories (copy the category name exactly as shown):

"Yes" - Use for: affirmative responses, agreement, willingness to be contacted, expressions of interest, "yes", "yeah", "sure", "okay", "call me", "I'm interested", "go ahead", "that works", "sounds good", "please do", "definitely", "absolutely"

"Call at a different time" - Use for: requests to reschedule, time-specific requests, mentions of specific times/days, "call me at 3pm", "call tomorrow", "call next week", "call Monday", "call in the morning", "call later", "different time", "another time", "schedule", "appointment", any time-related scheduling

"No" - Use for: negative responses, declining interest, "no", "nope", "not interested", "not now", "maybe later", "can't", "cannot", "busy", "not available", "not a good time", "decline", "pass", "not at this time"

"24 hours later (No response)" - Use ONLY when there is effectively NO reply: empty message, blank message, or a single character/symbol with no meaning (e.g. ".", "x", "k", "?"). This means "they did not respond" or "their reply was empty". Do NOT use this when the user typed a real message that you don't understand.

"Do not contact" - Use for: opt-out requests, DNC requests, "do not contact", "don't contact", "stop calling", "stop texting", "remove me", "unsubscribe", "opt out", "do not call", "don't call", "never call", "no more calls", "take me off", "remove from list", "DNC"

"Unknown message" - Use when the user typed something but you cannot determine their intent. Use this for: unclear messages, ambiguous messages, questions you don't understand, gibberish that looks like words, messages that don't fit Yes/No/Time/DNC, or when you are unsure what they want. WHEN IN DOUBT, use "Unknown message". If they typed more than a few characters and you don't understand, use "Unknown message" NOT "24 hours later (No response)".

EXAMPLES:
User: "yes" → Yes
User: "sure, call me" → Yes
User: "call me at 3pm" → Call at a different time
User: "call tomorrow morning" → Call at a different time
User: "no" → No
User: "not interested" → No
User: "stop calling me" → Do not contact
User: "unsubscribe" → Do not contact
User: "" or " " or "." or "k" → 24 hours later (No response)
User: "what?" → Unknown message
User: "idk" → Unknown message
User: "huh?" → Unknown message
User: "what do you want" → Unknown message
User: "asdfgh" → Unknown message
User: "maybe" → Unknown message
User: "call me maybe" → Call at a different time

CRITICAL INSTRUCTIONS:
1. Read the user's message CAREFULLY word-by-word and understand what they are actually saying
2. If you do NOT understand what the user wants, respond with "Unknown message". Do NOT use "24 hours later (No response)" for messages you don't understand.
3. "24 hours later (No response)" is ONLY for empty/no reply. "Unknown message" is for when they typed something but you can't classify it.
4. When in doubt between "24 hours later (No response)" and "Unknown message", choose "Unknown message"
5. Respond with ONLY the exact category name, nothing else - no explanations, no quotes, just the category name
6. If someone says "call me at 3pm", that is "Call at a different time", not "Yes"
7. If someone says "yes" or agrees, that is "Yes", not "Call at a different time"`
            },
            {
              role: 'user',
              content: userText
            }
          ],
          temperature: 0.1,
          max_tokens: 30
        })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: { message: errorText } }
        }
        
        console.error('OpenAI API error response:', response.status, errorData)
        
        // Handle specific error cases
        if (response.status === 429) {
          if (errorData.error?.code === 'insufficient_quota') {
            console.warn('⚠️ OpenAI API quota exceeded - using pattern matching fallback')
          } else {
            console.warn('⚠️ OpenAI API rate limit exceeded - using pattern matching fallback')
          }
        }
        
        throw new Error(`OpenAI API error: ${response.status}`)
      }
      
      const data = await response.json()
      let rawCategory = data.choices[0]?.message?.content?.trim() || ''
      console.log('✅ OpenAI API raw response:', JSON.stringify(rawCategory))
      
      // Normalize the response - remove quotes, extra whitespace, and normalize
      let normalizedCategory = rawCategory
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .trim()
      
      // Try to match variations of category names
      const categoryMap: Record<string, ResponseCategory> = {
        'yes': 'Yes',
        'call at a different time': 'Call at a different time',
        'no': 'No',
        '24 hours later (no response)': '24 hours later (No response)',
        '24 hours later': '24 hours later (No response)',
        'no response': '24 hours later (No response)',
        'do not contact': 'Do not contact',
        'do not call': 'Do not contact',
        'dnc': 'Do not contact',
        'unknown message': 'Unknown message',
        'unknown': 'Unknown message'
      }
      
      // Try exact match first
      const validCategories: ResponseCategory[] = ['Yes', 'Call at a different time', 'No', '24 hours later (No response)', 'Do not contact', 'Unknown message']
      let category: ResponseCategory | null = null
      
      if (validCategories.includes(normalizedCategory as ResponseCategory)) {
        category = normalizedCategory as ResponseCategory
      } else {
        // Try case-insensitive match
        const lowerCategory = normalizedCategory.toLowerCase()
        if (categoryMap[lowerCategory]) {
          category = categoryMap[lowerCategory]
        } else {
          // Try partial matching for longer category names
          for (const [key, value] of Object.entries(categoryMap)) {
            if (lowerCategory.includes(key) || key.includes(lowerCategory)) {
              category = value
              break
            }
          }
        }
      }
      
      if (category && validCategories.includes(category)) {
        console.log('✅ Using AI category:', category, '(normalized from:', rawCategory, ')')
        return category
      }
      
      // If invalid category, fall through to pattern matching
      console.warn('⚠️ OpenAI returned invalid category:', rawCategory, '(normalized:', normalizedCategory, ') - falling back to pattern matching')
    } catch (error) {
      console.error('❌ OpenAI API error:', error)
      console.log('🔄 Falling back to pattern matching')
      // Fall through to pattern matching fallback
    }
  } else {
    console.log('⚠️ No API key found or using placeholder - using pattern matching')
  }
  
  // Fallback to pattern matching if API fails or no key
  const fallbackCategory = categorizeUserResponsePatternMatching(userText)
  console.log('🔄 Using pattern matching category:', fallbackCategory)
  return fallbackCategory
}

/**
 * Fallback pattern matching categorization
 */
function categorizeUserResponsePatternMatching(userText: string): ResponseCategory {
  const text = userText.toLowerCase().trim()
  
  // DNC (Do Not Contact) patterns
  const dncPatterns = [
    'do not contact', 'don\'t contact', 'stop calling', 'stop texting', 'remove me',
    'unsubscribe', 'opt out', 'do not call', 'don\'t call', 'never call', 'no more calls',
    'take me off', 'remove from list', 'dnc', 'do not call list'
  ]
  if (dncPatterns.some(pattern => text.includes(pattern))) {
    return 'Do not contact'
  }
  
  // "Call at a different time" patterns - look for time-related keywords
  const timePatterns = [
    'call at', 'call me at', 'call back at', 'different time', 'another time',
    'later', 'tomorrow', 'next week', 'schedule', 'appointment', 'when can',
    'what time', 'what day', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'saturday', 'sunday', 'morning', 'afternoon', 'evening', 'am', 'pm',
    /\d{1,2}:\d{2}/, // Time patterns like "3:30"
    /\d{1,2}\s*(am|pm)/i, // "3 pm" or "3pm"
    'between', 'after', 'before'
  ]
  if (timePatterns.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(text)
    }
    return text.includes(pattern)
  })) {
    return 'Call at a different time'
  }
  
  // "Yes" patterns - affirmative responses
  const yesPatterns = [
    'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'sounds good', 'that works',
    'go ahead', 'please do', 'call me', 'call back', 'reach out', 'contact me',
    'i\'m interested', 'interested', 'definitely', 'absolutely', 'of course'
  ]
  if (yesPatterns.some(pattern => text.includes(pattern))) {
    return 'Yes'
  }
  
  // "No" patterns - negative responses
  const noPatterns = [
    'no', 'nope', 'not interested', 'not now', 'maybe later', 'not right now',
    'can\'t', 'cannot', 'busy', 'not available', 'not a good time', 'decline',
    'pass', 'not at this time'
  ]
  if (noPatterns.some(pattern => text.includes(pattern))) {
    return 'No'
  }
  
  // If no clear pattern matches, return Unknown
  return 'Unknown message'
}

/**
 * Detects if the user is asking to switch to the Confirm Visit workflow
 * (e.g. "I actually want to confirm a visit", "confirm my appointment")
 */
function isConfirmVisitIntent(userText: string): boolean {
  const text = userText.toLowerCase().trim()
  const confirmVisitPatterns = [
    'confirm a visit',
    'confirm the visit',
    'confirm my visit',
    'confirm visit',
    'confirm a appointment',
    'confirm the appointment',
    'confirm my appointment',
    'confirm appointment',
    'confirm my consultation',
    'confirm the consultation',
    'confirm consultation',
    'want to confirm a visit',
    'want to confirm visit',
    'actually want to confirm',
    'actually want to confirm a visit',
    'actually want to confirm my visit',
    'i want to confirm',
    'id like to confirm',
    'i\'d like to confirm',
    'appointment confirmation',
    'confirm my scheduled'
  ]
  return confirmVisitPatterns.some(pattern => text.includes(pattern))
}

/**
 * Swaps to Confirm Visit workflow on the fly without clearing conversation.
 * Updates workflow UI and sends the confirm-visit initial message.
 */
function switchToConfirmVisitWorkflow() {
  selectedWorkflow = 'confirm visit'
  document.querySelectorAll('.workflow-btn').forEach(btn => {
    const btnWorkflow = (btn as HTMLElement).dataset.workflow
    if (btnWorkflow === selectedWorkflow) {
      btn.classList.add('active')
      btn.classList.remove('red-active')
    } else {
      btn.classList.remove('active', 'red-active')
    }
  })
  selectedVersion = 'A'
  updateVersionButtons()
  updateDataflow()

  currentState = 'confirm_visit_initial'
  const fName = 'John'
  const appointmentDate = new Date()
  appointmentDate.setDate(appointmentDate.getDate() + 1)
  const dateTime = appointmentDate.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  const address = '123 Main Street, Anytown, ST 12345'
  const initialMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`

  setTimeout(() => {
    const options = ['Yes', 'No', 'Cancel Appointment', 'DNC', 'Unknown message']
    addMessage('bot', initialMessage, options)
    currentState = 'confirm_visit_waiting'
    updateDataflow()
  }, 500)
}


export function initApp() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = getAppHTML()

  // Update phone time display
  updatePhoneTime()
  setInterval(updatePhoneTime, 1000) // Update every second

  // Render initial dataflow
  renderDataflow()

  // Initialize workflow and version buttons
  initializeWorkflowButtons()
  updateVersionButtons()
  updateAIToggleButton()
  // Set initial visibility of phone and dataflow (hidden for Legal Requirements)
  updatePhoneAndDataflowVisibility()
  
  // Start the conversation
  setTimeout(() => {
    startConversation()
  }, 500)
  
  // Set up event listeners
  setupEventListeners()
}

function updatePhoneTime() {
  const timeElement = document.getElementById('phoneTime')
  if (timeElement) {
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    const hours12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours)
    const ampm = hours < 12 ? 'AM' : 'PM'
    const timeString = `${hours12}:${String(minutes).padStart(2, '0')} ${ampm}`
    timeElement.textContent = timeString
  }
}

function getAppHTML(): string {
  return `
    <div class="workflow-versions-container">
      <div class="workflows-section">
        <h3 class="section-title">Workflows</h3>
        <div class="workflow-buttons">
          <button class="workflow-btn ${selectedWorkflow === 'webform' ? 'active' : ''}" data-workflow="webform">
            Webform
          </button>
          <button class="workflow-btn ${selectedWorkflow === 'confirm visit' ? 'active' : ''}" data-workflow="confirm visit">
            Confirm Visit
          </button>
          <button class="workflow-btn ${selectedWorkflow === 'product question' ? 'active' : ''}" data-workflow="product question">
            Product Question
          </button>
          <button class="workflow-btn ${selectedWorkflow === 'offer' ? 'active red-active' : ''}" data-workflow="offer">
            Send Offer
          </button>
          <button class="workflow-btn ${selectedWorkflow === 'schedule consultation' ? 'active red-active' : ''}" data-workflow="schedule consultation">
            Schedule Consultation
          </button>
          <button class="workflow-btn ${selectedWorkflow === 'customer satisfaction check-in' ? 'active red-active' : ''}" data-workflow="customer satisfaction check-in">
            Customer Satisfaction Check-in
          </button>
          <button class="workflow-btn ${selectedWorkflow === 'legal requirements' ? 'active' : ''}" data-workflow="legal requirements">
            Legal Requirements
          </button>
          <button class="workflow-btn yellow-btn">Yellow</button>
          <button class="workflow-btn blue-btn">Blue</button>
          <button class="workflow-btn teal-btn">Teal</button>
        </div>
      </div>
      <div class="versions-section">
        <h3 class="section-title">Versions</h3>
        <div class="version-buttons">
          <button class="version-btn ${selectedVersion === 'A' ? 'active' : ''}" data-version="A">
            A
          </button>
          <button class="version-btn ${selectedVersion === 'B' ? 'active red-active' : ''}" data-version="B">
            B
          </button>
        </div>
      </div>
      <div class="ai-toggle-section">
        <h3 class="section-title">Enable AI</h3>
        <button class="ai-toggle-btn ${aiEnabled ? 'enabled' : 'disabled'}" id="aiToggleBtn">
          ${aiEnabled ? '✓' : '✕'}
        </button>
      </div>
    </div>
    <div class="legal-requirements-box" id="legalRequirementsBox" style="display: none;">
      <div class="legal-requirements-header">
        <h2 class="legal-requirements-title">Legal Requirements</h2>
        <div class="legal-requirements-tabs">
          <button type="button" class="legal-requirements-tab-btn active" data-legal-tab="requirements">Legal Requirements</button>
          <button type="button" class="legal-requirements-tab-btn" data-legal-tab="webform">Current Webform</button>
        </div>
      </div>
      <div class="legal-requirements-tab-content active" id="legalRequirementsListContent">
      <ul class="legal-requirements-list">
        <li><strong>TCPA consent on webforms:</strong> Ensure each lead/webform includes explicit consent to be called and texted (covers prerecorded calls, autodialers, and SMS). Verify wording and that consent is captured.</li>
        <li><strong>Verify provenance of consent before sending SMS:</strong> Only send texts when the originating webform/lead contains the required consent; check consent status before each outbound texting campaign if not a one-time interaction.</li>
        <li><strong>AI disclosure:</strong> Clearly disclose that the customer is interacting with an AI/virtual agent in both voice and SMS channels (use the same language as ADT's digital assistant disclosure).</li>
        <li><strong>Message &amp; data rates notice:</strong> Include "message and data rates may apply" in the initial SMS message that starts a two-way conversation.</li>
        <li><strong>STOP/opt-out instructions:</strong> Include clear opt-out instructions (e.g., "Reply STOP to stop") in the initial SMS and ensure STOP requests are honored immediately.</li>
        <li><strong>DNC / DNT scrubbing and integration:</strong> Scrub all outbound calls and texts against the enterprise Do-Not-Call and Do-Not-Text lists; integrate Sierra with ADT's central DNC/DNT systems so updates (including ADNT/ADNC requests) are honored in real time.</li>
        <li><strong>Handle non-standard responses:</strong> Implement and sync a list of non-standard/trigger responses (e.g., "do not call/text") so those inputs on inbound messages are recognized and applied to DNC/DNT lists.</li>
        <li><strong>Recording retention &amp; legal compliance:</strong> Ensure recorded voice retention aligns with legal/retention schedules and that retention settings are configured per policy.</li>
        <li><strong>Script and disclosure review:</strong> Obtain legal review/sign-off (Maria/Jamie) on outbound SMS and voice scripts, including required disclosures and AI wording, before production.</li>
        <li><strong>Short code vs long code compliance:</strong> Determine messaging channel (short code/long code); if using short code, allow time for carrier application/approval (often 3–4 months) and ensure compliance with carrier rules.</li>
        <li><strong>Frequency/recurrence rules for disclosures:</strong> Include required disclosures on the initial SMS that begins a conversation; re-send disclosures (message/data rates and STOP) when a new conversation is initiated after a period or when re-initiating contact (e.g., schedule-based follow-ups).</li>
        <li><strong>Diligence for nurture campaigns:</strong> For ongoing or nurture SMS campaigns, ensure full integration with consent tracking and DNC/DNT systems to avoid re-contacting numbers that later opt out or were added to DNC.</li>
        <li><strong>Real-time checks on reactive sends:</strong> When Sierra/reactive systems initiate SMS in response to customer prompts (e.g., "text me"), perform a real-time DNC/DNT and consent check before sending.</li>
        <li><strong>Logging and audit trails:</strong> Maintain logs of consent, opt-outs, message content, timestamps, and system checks to support compliance audits and defend against TCPA claims.</li>
      </ul>
      </div>
      <div class="legal-requirements-tab-content" id="legalRequirementsWebformContent">
        <div class="legal-requirements-webform-image-wrap">
          <img src="/adt-webform.png" alt="Current ADT webform - Get a free quote and ADT offers" class="legal-requirements-webform-image" />
        </div>
      </div>
    </div>
    <div class="phone-container">
      <div class="phone-header">
        <div class="phone-status-bar">
          <span class="time" id="phoneTime">9:41</span>
          <div class="status-icons">
            <span>📶</span>
            <span>🔋</span>
          </div>
        </div>
        <div class="tabs-container">
          <button class="tab-btn ${activeTab === 'chat' ? 'active' : ''}" data-tab="chat" id="chatTab">
            Chat
          </button>
          <button class="tab-btn ${activeTab === 'dialogue' ? 'active' : ''}" data-tab="dialogue" id="dialogueTab">
            Dialogue Editor
          </button>
        </div>
        <div class="chat-header">
          <button class="back-btn" title="Refresh conversation">↻</button>
          <div class="contact-info">
            <div class="contact-name">Customer Service</div>
            <div class="contact-status">Online</div>
          </div>
        </div>
      </div>
      
      <!-- Chat View -->
      <div class="tab-content ${activeTab === 'chat' ? 'active' : ''}" id="chatView">
        <div class="messages-container" id="messagesContainer">
          <!-- Messages will be inserted here -->
        </div>
        
        <div class="input-area" id="inputArea">
          <!-- Input area will be dynamically updated -->
        </div>
      </div>
      
      <!-- Dialogue Editor View -->
      <div class="tab-content ${activeTab === 'dialogue' ? 'active' : ''}" id="dialogueView">
        <div class="dialogue-editor-container" id="dialogueEditorContainer">
          <!-- Dialogue editor will be inserted here -->
        </div>
      </div>
      
      <!-- Calling Notification Overlay -->
      <div class="calling-overlay" id="callingOverlay" style="display: none;">
        <div class="calling-content">
          <div class="calling-icon">📞</div>
          <div class="calling-title">Incoming Call</div>
          <div class="calling-subtitle">Customer Service</div>
          <div class="calling-buttons">
            <button class="call-btn decline" id="declineBtn">✕</button>
            <button class="call-btn accept" id="acceptBtn">✓</button>
          </div>
        </div>
      </div>
      
      <!-- Active Call Screen -->
      <div class="call-screen-overlay" id="callScreenOverlay" style="display: none;">
        <div class="call-screen-content">
          <div class="call-screen-header">
            <div class="call-status">Calling...</div>
          </div>
          <div class="call-screen-body">
            <div class="caller-avatar">
              <div class="avatar-circle">CS</div>
            </div>
            <div class="caller-name">Customer Service</div>
            <div class="call-duration" id="callDuration">00:00</div>
          </div>
          <div class="call-screen-controls">
            <button class="call-control-btn mute" id="muteBtn" title="Mute">
              <svg id="muteIcon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            </button>
            <button class="call-control-btn keypad" id="keypadBtn" title="Keypad">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" fill="none"></rect>
                <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"></circle>
                <circle cx="12" cy="7.5" r="1.5" fill="currentColor"></circle>
                <circle cx="16.5" cy="7.5" r="1.5" fill="currentColor"></circle>
                <circle cx="7.5" cy="12" r="1.5" fill="currentColor"></circle>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
                <circle cx="16.5" cy="12" r="1.5" fill="currentColor"></circle>
                <circle cx="7.5" cy="16.5" r="1.5" fill="currentColor"></circle>
                <circle cx="12" cy="16.5" r="1.5" fill="currentColor"></circle>
                <circle cx="16.5" cy="16.5" r="1.5" fill="currentColor"></circle>
                <circle cx="12" cy="20.5" r="1.5" fill="currentColor"></circle>
              </svg>
            </button>
            <button class="call-control-btn speaker" id="speakerBtn" title="Speaker">
              <svg id="speakerIcon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path class="speaker-waves" d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
            <button class="call-control-btn add-call" id="addCallBtn" title="Add Call">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
            </button>
            <button class="call-control-btn face-time" id="faceTimeBtn" title="FaceTime">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                <path d="M17 10l-5-3v6l5-3z"></path>
              </svg>
            </button>
            <button class="call-control-btn contacts" id="contactsBtn" title="Contacts">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </button>
          </div>
          <div class="call-screen-end">
            <button class="end-call-btn" id="endCallBtn">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                <line x1="16" y1="8" x2="8" y2="16"></line>
                <line x1="8" y1="8" x2="16" y2="16"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Keypad Modal -->
      <div class="keypad-overlay" id="keypadOverlay" style="display: none;">
        <div class="keypad-content">
          <div class="keypad-header">
            <button class="keypad-close" id="keypadCloseBtn">Done</button>
            <div class="keypad-display" id="keypadDisplay"></div>
          </div>
          <div class="keypad-grid">
            <button class="keypad-key" data-key="1">
              <span class="key-number">1</span>
            </button>
            <button class="keypad-key" data-key="2">
              <span class="key-number">2</span>
              <span class="key-letters">ABC</span>
            </button>
            <button class="keypad-key" data-key="3">
              <span class="key-number">3</span>
              <span class="key-letters">DEF</span>
            </button>
            <button class="keypad-key" data-key="4">
              <span class="key-number">4</span>
              <span class="key-letters">GHI</span>
            </button>
            <button class="keypad-key" data-key="5">
              <span class="key-number">5</span>
              <span class="key-letters">JKL</span>
            </button>
            <button class="keypad-key" data-key="6">
              <span class="key-number">6</span>
              <span class="key-letters">MNO</span>
            </button>
            <button class="keypad-key" data-key="7">
              <span class="key-number">7</span>
              <span class="key-letters">PQRS</span>
            </button>
            <button class="keypad-key" data-key="8">
              <span class="key-number">8</span>
              <span class="key-letters">TUV</span>
            </button>
            <button class="keypad-key" data-key="9">
              <span class="key-number">9</span>
              <span class="key-letters">WXYZ</span>
            </button>
            <button class="keypad-key" data-key="*">
              <span class="key-number">*</span>
            </button>
            <button class="keypad-key" data-key="0">
              <span class="key-number">0</span>
              <span class="key-letters">+</span>
            </button>
            <button class="keypad-key" data-key="#">
              <span class="key-number">#</span>
            </button>
          </div>
          <button class="keypad-delete" id="keypadDeleteBtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
              <line x1="18" y1="9" x2="12" y2="15"></line>
              <line x1="12" y1="9" x2="18" y2="15"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Contacts Modal -->
      <div class="contacts-overlay" id="contactsOverlay" style="display: none;">
        <div class="contacts-content">
          <div class="contacts-header">
            <button class="contacts-close" id="contactsCloseBtn">Done</button>
            <h2>Contacts</h2>
          </div>
          <div class="contacts-list">
            <div class="contact-item">
              <div class="contact-avatar-small">CS</div>
              <div class="contact-details">
                <div class="contact-name-large">Customer Service</div>
                <div class="contact-phone">+1 (555) 123-4567</div>
                <div class="contact-email">service@company.com</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Time Passing Animation Overlay -->
      <div class="time-passing-overlay" id="timePassingOverlay" style="display: none;">
        <div class="time-passing-content">
          <div class="time-passing-icon">⏰</div>
          <div class="time-passing-title">24 Hours Later...</div>
          <div class="time-passing-progress">
            <div class="time-passing-bar" id="timePassingBar"></div>
          </div>
        </div>
      </div>
      
      <!-- Date/Time Picker Modal -->
      <div class="modal-overlay" id="dateTimeModal" style="display: none;">
        <div class="modal-content">
          <h3>Select Date & Time</h3>
          <div class="date-time-picker">
            <div class="picker-group">
              <label>Date:</label>
              <input type="date" id="datePicker" min="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="picker-group">
              <label>Time:</label>
              <div class="custom-time-picker">
                <select id="hourPicker" class="time-select">
                  <option value="9">9</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
                <span class="time-separator">:</span>
                <select id="minutePicker" class="time-select">
                  ${Array.from({ length: 12 }, (_, i) => {
                    const minutes = i * 5;
                    return `<option value="${String(minutes).padStart(2, '0')}">${String(minutes).padStart(2, '0')}</option>`
                  }).join('')}
                </select>
                <select id="ampmPicker" class="time-select ampm-select" disabled>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>
          <div class="modal-buttons">
            <button class="btn-secondary" id="cancelDateTimeBtn">Cancel</button>
            <button class="btn-primary" id="confirmDateTimeBtn">Confirm</button>
          </div>
        </div>
      </div>
    </div>
    <div class="white-box">
      <div class="dataflow-container">
        <h2 class="dataflow-title">Conversation Dataflow</h2>
        <div class="dataflow-diagram" id="dataflowDiagram">
          <!-- Flowchart will be rendered here -->
        </div>
      </div>
    </div>
  `
}

function setupEventListeners() {
  // Tab switching
  document.getElementById('chatTab')?.addEventListener('click', () => switchTab('chat'))
  document.getElementById('dialogueTab')?.addEventListener('click', () => switchTab('dialogue'))
  
  // Legal Requirements box tabs
  document.querySelectorAll('.legal-requirements-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.legalTab
      document.querySelectorAll('.legal-requirements-tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.legal-requirements-tab-content').forEach(c => c.classList.remove('active'))
      btn.classList.add('active')
      if (tab === 'requirements') {
        document.getElementById('legalRequirementsListContent')?.classList.add('active')
      } else if (tab === 'webform') {
        document.getElementById('legalRequirementsWebformContent')?.classList.add('active')
      }
    })
  })
  
  // Back button - reset and restart conversation
  document.querySelector('.back-btn')?.addEventListener('click', resetConversation)
  
  // Workflow buttons
  document.querySelectorAll('.workflow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const workflow = (e.target as HTMLElement).dataset.workflow
      if (workflow) {
        handleWorkflowSelect(workflow)
      }
    })
  })
  
  // Version buttons
  document.querySelectorAll('.version-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const version = (e.target as HTMLElement).dataset.version
      if (version) {
        handleVersionSelect(version)
      }
    })
  })
  
  // AI toggle button
  document.getElementById('aiToggleBtn')?.addEventListener('click', handleAIToggle)

  // Calling overlay buttons
  document.getElementById('acceptBtn')?.addEventListener('click', handleCallAccept)
  document.getElementById('declineBtn')?.addEventListener('click', handleCallDecline)
  
  // End call button
  document.getElementById('endCallBtn')?.addEventListener('click', handleEndCall)
  
  // Call control buttons
  document.getElementById('muteBtn')?.addEventListener('click', handleMuteToggle)
  document.getElementById('speakerBtn')?.addEventListener('click', handleSpeakerToggle)
  document.getElementById('keypadBtn')?.addEventListener('click', handleKeypadToggle)
  document.getElementById('addCallBtn')?.addEventListener('click', handleAddCall)
  document.getElementById('faceTimeBtn')?.addEventListener('click', handleFaceTime)
  document.getElementById('contactsBtn')?.addEventListener('click', handleContacts)
  
  // Keypad buttons (set up when keypad is shown)
  document.getElementById('keypadCloseBtn')?.addEventListener('click', hideKeypad)
  document.getElementById('keypadDeleteBtn')?.addEventListener('click', handleKeypadDelete)
  
  // Contacts button
  document.getElementById('contactsCloseBtn')?.addEventListener('click', hideContacts)
  
  // Date/time picker
  document.getElementById('confirmDateTimeBtn')?.addEventListener('click', handleDateTimeConfirm)
  document.getElementById('cancelDateTimeBtn')?.addEventListener('click', handleDateTimeCancel)
}

function handleHourChange() {
  const hourPicker = document.getElementById('hourPicker') as HTMLSelectElement
  const ampmPicker = document.getElementById('ampmPicker') as HTMLSelectElement
  
  if (hourPicker && ampmPicker) {
    const selectedHour = parseInt(hourPicker.value)
    // Hours 9, 10, 11 are AM, hours 12, 1, 2, 3, 4, 5 are PM
    if (selectedHour >= 9 && selectedHour <= 11) {
      ampmPicker.value = 'AM'
    } else {
      ampmPicker.value = 'PM'
    }
  }
}

function resetConversation() {
  // Clear all messages
  messages.length = 0
  
  // Reset state
  currentState = 'initial'
  userHasStopped = false
  updateDataflow()
  scheduledDateTime = null
  isAfter24HourFollowup = false
  
  // Hide all overlays and modals
  hideCallingNotification()
  hideCallScreen()
  const modal = document.getElementById('dateTimeModal')
  if (modal) {
    modal.style.display = 'none'
  }
  
  // Clear input area
  clearInputArea()
  
  // Clear messages container
  const container = document.getElementById('messagesContainer')
  if (container) {
    container.innerHTML = ''
  }
  
  // Restart conversation
  startConversation()
}

function startConversation() {
  // Clear previous messages
  messages.length = 0
  const container = document.getElementById('messagesContainer')
  if (container) {
    container.innerHTML = ''
  }
  
  // Reset state
  currentState = 'initial'
  userHasStopped = false
  scheduledDateTime = null
  isAfter24HourFollowup = false
  
  // Start conversation based on selected workflow
  if (selectedWorkflow === 'product question') {
    startProductQuestionConversation()
  } else if (selectedWorkflow === 'confirm visit') {
    startConfirmVisitConversation()
  } else {
    // Default webform workflow (version B omits the "We received your interest form!" message)
    if (selectedVersion === 'A') {
      addMessage('bot', 'We received your interest form! We are calling now.')
    }
    setTimeout(() => {
      showCallingNotification()
    }, 1500)
  }
}

function addMessage(sender: 'bot' | 'user', text: string, options?: string[]) {
  // If user typed STOP, do not send another message no matter what
  if (sender === 'bot' && userHasStopped) return

  // When the first message is sent on any view, show the ADT intro first
  if (sender === 'bot' && messages.length === 0) {
    const introMessage: Message = {
      id: (Date.now() - 1).toString(),
      text: ADT_INTRO_MESSAGE,
      sender: 'bot',
      timestamp: new Date(),
      options: undefined
    }
    messages.push(introMessage)
  }

  const message: Message = {
    id: Date.now().toString(),
    text,
    sender,
    timestamp: new Date(),
    options
  }
  
  messages.push(message)
  renderMessages()
  
  // Update dialogue editor if it's active
  if (activeTab === 'dialogue') {
    renderDialogueEditor()
  }
  
  // Auto-scroll to bottom
  setTimeout(() => {
    const container = document.getElementById('messagesContainer')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, 100)
}

function renderMessages() {
  const container = document.getElementById('messagesContainer')
  if (!container) return
  
  container.innerHTML = messages.map(msg => {
    // Skip rendering empty messages (only show if there's text or it's a user message)
    if (!msg.text && msg.sender === 'bot' && msg.options) {
      return ''
    }
    
    const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const isBot = msg.sender === 'bot'
    
    return `
      <div class="message ${isBot ? 'message-received' : 'message-sent'}">
        <div class="message-bubble">
          <div class="message-text">${msg.text}</div>
          <div class="message-time">${time}</div>
        </div>
      </div>
    `
  }).join('')
  
  // Render options if available
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.options && lastMessage.sender === 'bot') {
    renderOptions(lastMessage.options)
  } else {
    clearInputArea()
  }
}

function renderOptions(options: string[]) {
  const inputArea = document.getElementById('inputArea')
  if (!inputArea) return
  
  // Check if AI is enabled to determine input method
  if (aiEnabled) {
    // AI enabled: Show text input for AI categorization
    inputArea.innerHTML = `
      <div class="text-input-container">
        <input 
          type="text" 
          id="userTextInput" 
          class="user-text-input" 
          placeholder="Type your response here..."
          autocomplete="off"
        />
        <button id="sendTextBtn" class="send-text-btn" title="Send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div class="ai-category-hint">
        <small>AI will categorize your message automatically</small>
      </div>
    `
    
    // Add event listeners for text input
    const textInput = document.getElementById('userTextInput') as HTMLInputElement
    const sendBtn = document.getElementById('sendTextBtn')
    
    if (textInput) {
      // Handle Enter key
      textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          handleTextInput()
        }
      })
      
      // Focus the input
      setTimeout(() => textInput.focus(), 100)
    }
    
    if (sendBtn) {
      sendBtn.addEventListener('click', handleTextInput)
    }
  } else {
    // AI disabled: Show static buttons (non-AI version)
    inputArea.innerHTML = `
      <div class="options-container">
        ${options.map((option, index) => `
          <button class="option-btn" data-option="${index}">${option}</button>
        `).join('')}
      </div>
    `
    
    // Add event listeners to option buttons
    inputArea.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const optionIndex = parseInt((e.target as HTMLElement).dataset.option || '0')
        handleOptionSelect(options[optionIndex])
      })
    })
  }
}

async function handleTextInput() {
  const textInput = document.getElementById('userTextInput') as HTMLInputElement
  if (!textInput) return

  const userText = textInput.value.trim()
  if (!userText) return

  // If user types STOP, opt out: show their message and never send another message
  if (userText.toUpperCase() === 'STOP') {
    userHasStopped = true
    addMessage('user', userText)
    textInput.value = ''
    return
  }

  // In webform flow with AI: if user says they want to confirm a visit, swap workflow on the fly
  if (selectedWorkflow === 'webform' && isConfirmVisitIntent(userText)) {
    addMessage('user', userText)
    textInput.value = ''
    switchToConfirmVisitWorkflow()
    return
  }

  // Show user's message
  addMessage('user', userText)

  // Clear input
  textInput.value = ''

  // Show loading indicator
  const inputArea = document.getElementById('inputArea')
  if (inputArea) {
    const hint = inputArea.querySelector('.ai-category-hint')
    if (hint) {
      hint.innerHTML = '<small>🤖 AI is categorizing your message...</small>'
    }
  }
  
  // Categorize using AI (with fallback to pattern matching)
  const category = await categorizeUserResponse(userText)
  
  // Check if we're using AI or pattern matching by checking console for recent API call
  // We'll show a message indicating the method used
  const isUsingAI = import.meta.env.VITE_OPENAI_API_KEY && import.meta.env.VITE_OPENAI_API_KEY !== 'YOUR_API_KEY'
  
  // Show the category that was detected (optional - for transparency)
  setTimeout(() => {
    if (inputArea) {
      const hint = inputArea.querySelector('.ai-category-hint')
      if (hint) {
        // Check if there was an API error in console (we can't directly check, but we can infer)
        // For now, just show the category
        hint.innerHTML = `<small>✓ Categorized as: <strong>${category}</strong></small>`
        setTimeout(() => {
          if (hint) {
            hint.innerHTML = '<small>AI will categorize your message automatically</small>'
          }
        }, 2000)
      }
    }
  }, 300)
  
  // Process the categorized response
  handleOptionSelect(category)
}

function clearInputArea() {
  const inputArea = document.getElementById('inputArea')
  if (inputArea) {
    inputArea.innerHTML = ''
  }
}

function showCallingNotification() {
  currentState = 'calling'
  updateDataflow()
  const overlay = document.getElementById('callingOverlay')
  if (overlay) {
    overlay.style.display = 'flex'
  }
}

function hideCallingNotification() {
  const overlay = document.getElementById('callingOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }
}

function handleCallAccept() {
  hideCallingNotification()
  currentState = 'call_accepted'
  updateDataflow()
  showCallScreen()
}

function showCallScreen() {
  const callScreen = document.getElementById('callScreenOverlay')
  const callStatus = document.querySelector('.call-status')
  if (callScreen) {
    callScreen.style.display = 'flex'
    callStartTime = new Date()
    
    // Reset call control states
    isMuted = false
    isSpeakerOn = false
    isKeypadVisible = false
    keypadInput = ''
    
    // Reset button states
    document.getElementById('muteBtn')?.classList.remove('active')
    document.getElementById('speakerBtn')?.classList.remove('active')
    document.getElementById('keypadBtn')?.classList.remove('active')
    document.getElementById('addCallBtn')?.classList.remove('active')
    document.getElementById('faceTimeBtn')?.classList.remove('active')
    document.getElementById('contactsBtn')?.classList.remove('active')
    
    // Hide keypad and contacts if open
    hideKeypad()
    hideContacts()
    
    
    
    // Update status to "Calling..." initially
    if (callStatus) {
      callStatus.textContent = 'Calling...'
    }
    
    // After 2 seconds, change to "Connected"
    setTimeout(() => {
      if (callStatus) {
        callStatus.textContent = 'Connected'
      }
    }, 2000)
    
    startCallTimer()
  }
}

function hideCallScreen() {
  const callScreen = document.getElementById('callScreenOverlay')
  if (callScreen) {
    callScreen.style.display = 'none'
  }
  if (callDurationInterval) {
    clearInterval(callDurationInterval)
    callDurationInterval = null
  }
  callStartTime = null
}

function startCallTimer() {
  const durationElement = document.getElementById('callDuration')
  if (!durationElement) return
  
  callDurationInterval = window.setInterval(() => {
    if (callStartTime && durationElement) {
      const elapsed = Math.floor((new Date().getTime() - callStartTime.getTime()) / 1000)
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      durationElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
  }, 1000)
}

function handleCallDecline() {
  hideCallingNotification()
  currentState = 'call_declined'
  updateDataflow()
  
  setTimeout(() => {
    const options = ['Yes', 'Call at a different time', 'No', '24 hours later (No response)', 'Do not contact', 'Unknown message']
    let message = 'Hello, we just called to reach out about our product! Would you like us to call you back?'
    if (selectedWorkflow === 'product question') {
      message = 'Hello, we received your product question. Would you like us to call you back to help?'
    }
    addMessage('bot', message, options)
    currentState = 'waiting_for_response'
    updateDataflow()
  }, 500)
}

function handleOptionSelect(option: string) {
  addMessage('user', option)
  
  // Handle confirm visit workflow
  if (selectedWorkflow === 'confirm visit') {
    handleConfirmVisitResponse(option)
    return
  }
  
  switch (currentState) {
    case 'waiting_for_response':
    case 'followup_next_day':
      handleResponseToCallQuestion(option)
      break
    case 'asking_better_time':
      handleBetterTimeResponse(option)
      break
    case 'asking_after_cancel':
      handleAfterCancelResponse(option)
      break
    default:
      break
  }
}

function handleAfterCancelResponse(option: string) {
  if (option === 'Yes') {
    // Go back to the date/time picker
    setTimeout(() => {
      showDateTimePicker()
    }, 500)
  } else {
    // When user says "No" after canceling date/time picker, loop back to 24 hour flow
    showTimePassingAnimation()
  }
}

function handleResponseToCallQuestion(option: string) {
  // Get the appropriate message based on workflow
  const getFollowupMessage = () => {
    if (selectedWorkflow === 'product question') {
      return 'Hello, we called yesterday about your product question. Would you like to schedule a time for us to call you?'
    }
    return 'Hello, we called yesterday to reach out about our product! Would you like to schedule a time for us to call you?'
  }
  
  switch (option) {
    case 'Yes':
      if (isAfter24HourFollowup) {
        // After 24-hour follow-up: show date/time picker for scheduling
        isAfter24HourFollowup = false // Reset flag
        showDateTimePicker()
      } else {
        // Original behavior: show calling notification
        setTimeout(() => {
          showCallingNotification()
        }, 500)
      }
      break
      
    case 'Call at a different time':
      showDateTimePicker()
      break
      
    case 'No':
      if (isAfter24HourFollowup) {
        // After 24-hour follow-up: loop back to followup next day after 24 more hours
        showTimePassingAnimation()
      } else {
        // Original behavior: ask for better time
        currentState = 'asking_better_time'
        updateDataflow()
        setTimeout(() => {
          const options = ['Yes', 'No']
          addMessage('bot', 'Is there a better time that we can call you?', options)
        }, 500)
      }
      break
      
    case 'No/No response':
      // This option should no longer appear in followup_next_day, but handle it if it somehow does
      if (isAfter24HourFollowup) {
        // Loop back to followup next day instead of going to DNC
        showTimePassingAnimation()
      }
      break
      
    case 'No response':
    case '24 hours later (No response)':
      if (isAfter24HourFollowup) {
        // After 24-hour follow-up: loop back to followup next day
        showTimePassingAnimation()
      } else {
        // Original behavior: Show 24 hour time passing animation
        showTimePassingAnimation()
      }
      break
      
    case 'Do not contact':
      // Go directly to DNC
      addMessage('bot', 'Have a nice day!')
      currentState = 'ended'
      updateDataflow()
      break
      
    case 'Unknown message':
      // Unknown message received
      addMessage('bot', 'Unknown message received, transferring to messaging agent.')
      currentState = 'unknown'
      updateDataflow()
      break
  }
}

function handleBetterTimeResponse(option: string) {
  if (option === 'Yes') {
    showDateTimePicker()
  } else {
    // When user says "No" to better time, go to followup next day
    showTimePassingAnimation()
  }
}

// Confirm Visit Workflow Functions
function startConfirmVisitConversation() {
  currentState = 'confirm_visit_initial'
  updateDataflow()
  
  // Sample data - in production, this would come from the appointment system
  const fName = 'John'
  const appointmentDate = new Date()
  appointmentDate.setDate(appointmentDate.getDate() + 1) // Tomorrow
  const dateTime = appointmentDate.toLocaleString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  const address = '123 Main Street, Anytown, ST 12345'
  
  const initialMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
  
  setTimeout(() => {
    const options = ['Yes', 'No', 'Cancel Appointment', 'DNC', 'Unknown message']
    addMessage('bot', initialMessage, options)
    currentState = 'confirm_visit_waiting'
    updateDataflow()
  }, 500)
}

function handleConfirmVisitResponse(option: string) {
  switch (currentState) {
    case 'confirm_visit_waiting':
      if (option === 'Yes') {
        // Confirm Appointment
        currentState = 'confirm_visit_confirmed'
        updateDataflow()
        setTimeout(() => {
          addMessage('bot', 'Great! We will see you then.')
        }, 500)
      } else if (option === 'No') {
        // Reschedule Appointment
        currentState = 'confirm_visit_reschedule_question'
        updateDataflow()
        setTimeout(() => {
          const options = ['Yes', 'No']
          addMessage('bot', 'Is there a better time we could reschedule the appointment for?', options)
          currentState = 'confirm_visit_reschedule_waiting'
          updateDataflow()
        }, 500)
      } else if (option === 'Cancel Appointment') {
        // Cancel Appointment - first ask to reschedule
        currentState = 'confirm_visit_reschedule_question'
        updateDataflow()
        setTimeout(() => {
          const options = ['Yes', 'No']
          addMessage('bot', 'Is there a better time we could reschedule the appointment for?', options)
          currentState = 'confirm_visit_reschedule_waiting'
          updateDataflow()
        }, 500)
      } else if (option === 'Do not contact' || option === 'DNC') {
        // Cancel Appointment + Add to DNC List
        currentState = 'confirm_visit_dnc'
        updateDataflow()
        setTimeout(() => {
          addMessage('bot', 'Your appointment has been canceled and you will no longer receive notifications from this number.')
        }, 500)
      } else if (option === 'Unknown message') {
        // Unknown response
        currentState = 'unknown'
        updateDataflow()
        setTimeout(() => {
          addMessage('bot', 'Unknown message received, transferring to messaging agent.')
        }, 500)
      }
      break
      
    case 'confirm_visit_reschedule_waiting':
      if (option === 'Yes') {
        // User wants to reschedule - show date/time picker
        currentState = 'confirm_visit_reschedule_selecting_time'
        updateDataflow()
        setTimeout(() => {
          showConfirmVisitRescheduleDateTimePicker()
        }, 500)
      } else if (option === 'No') {
        // User doesn't want to reschedule - cancel appointment
        currentState = 'confirm_visit_cancelled'
        updateDataflow()
        setTimeout(() => {
          addMessage('bot', 'Your appointment has been canceled, please reach out if you would like to reschedule.')
        }, 500)
      } else if (option === 'Unknown message') {
        // Unknown response
        currentState = 'unknown'
        updateDataflow()
        setTimeout(() => {
          addMessage('bot', 'Unknown message received, transferring to messaging agent.')
        }, 500)
      }
      break
      
    default:
      break
  }
}

function showDateTimePicker() {
  currentState = 'scheduling_time'
  updateDataflow()
  openDateTimeModalAndSetup()
}

/** Opens the date/time modal for confirm visit reschedule (state already set to confirm_visit_reschedule_selecting_time). */
function showConfirmVisitRescheduleDateTimePicker() {
  updateDataflow()
  openDateTimeModalAndSetup()
}

function openDateTimeModalAndSetup() {
  const modal = document.getElementById('dateTimeModal')
  if (modal) {
    modal.style.display = 'flex'
  }
  
  // Set minimum date to today and default to today's date
  const datePicker = document.getElementById('datePicker') as HTMLInputElement
  if (datePicker) {
    const today = new Date().toISOString().split('T')[0]
    datePicker.min = today
    datePicker.value = today
  }
  
  // Set up custom time picker with 5-minute intervals (12-hour format)
  // Restricted to 9:00 AM - 5:00 PM
  const hourPicker = document.getElementById('hourPicker') as HTMLSelectElement
  const minutePicker = document.getElementById('minutePicker') as HTMLSelectElement
  const ampmPicker = document.getElementById('ampmPicker') as HTMLSelectElement
  
  if (hourPicker && minutePicker && ampmPicker) {
    // Set default time to next 5-minute interval, but ensure it's within 9 AM - 5 PM
    const now = new Date()
    const minutes = now.getMinutes()
    const roundedMinutes = Math.ceil(minutes / 5) * 5
    let hours = now.getHours()
    const finalMinutes = roundedMinutes >= 60 ? 0 : roundedMinutes
    let finalHours24 = roundedMinutes >= 60 ? (hours + 1) % 24 : hours
    
    // Clamp to business hours (9 AM - 5 PM)
    if (finalHours24 < 9) {
      finalHours24 = 9
      minutePicker.value = '00'
    } else if (finalHours24 >= 17) {
      finalHours24 = 17
      minutePicker.value = '00'
    } else {
      minutePicker.value = String(finalMinutes).padStart(2, '0')
    }
    
    // Convert to 12-hour format
    let displayHour: number
    let ampm: string
    if (finalHours24 === 0) {
      displayHour = 12
      ampm = 'AM'
    } else if (finalHours24 === 12) {
      displayHour = 12
      ampm = 'PM'
    } else if (finalHours24 < 12) {
      displayHour = finalHours24
      ampm = 'AM'
    } else {
      displayHour = finalHours24 - 12
      ampm = 'PM'
    }
    
    hourPicker.value = String(displayHour)
    ampmPicker.value = ampm
    
    // Set up event listener for auto-updating AM/PM
    hourPicker.removeEventListener('change', handleHourChange)
    hourPicker.addEventListener('change', handleHourChange)
  }
}

function handleDateTimeConfirm() {
  const datePicker = document.getElementById('datePicker') as HTMLInputElement
  const hourPicker = document.getElementById('hourPicker') as HTMLSelectElement
  const minutePicker = document.getElementById('minutePicker') as HTMLSelectElement
  const ampmPicker = document.getElementById('ampmPicker') as HTMLSelectElement
  
  if (!datePicker?.value || !hourPicker?.value || !minutePicker?.value || !ampmPicker?.value) {
    alert('Please select both date and time')
    return
  }
  
  // Convert 12-hour format to 24-hour format
  let hours24 = parseInt(hourPicker.value)
  const minutes = minutePicker.value.padStart(2, '0')
  const ampm = ampmPicker.value
  
  if (ampm === 'PM' && hours24 !== 12) {
    hours24 += 12
  } else if (ampm === 'AM' && hours24 === 12) {
    hours24 = 0
  }
  
  // Validate time is within business hours (9:00 AM - 5:00 PM)
  // 5:00 PM is 17:00, so we allow up to but not including 17:00
  if (hours24 < 9 || hours24 >= 17) {
    alert('Please select a time between 9:00 AM and 5:00 PM')
    return
  }
  
  // Special case: if it's exactly 5:00 PM (17:00), that's the last valid time
  if (hours24 === 17 && minutes !== '00') {
    alert('Please select a time between 9:00 AM and 5:00 PM')
    return
  }
  
  const timeString = `${String(hours24).padStart(2, '0')}:${minutes}`
  const date = new Date(`${datePicker.value}T${timeString}`)
  scheduledDateTime = date
  
  const modal = document.getElementById('dateTimeModal')
  if (modal) {
    modal.style.display = 'none'
  }
  
  const formattedDate = date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
  const formattedTime = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  })
  
  if (currentState === 'confirm_visit_reschedule_selecting_time') {
    addMessage('bot', `Your appointment has been rescheduled for ${formattedDate} at ${formattedTime}. We'll see you then!`)
    currentState = 'confirm_visit_confirmed'
  } else {
    addMessage('bot', `We will call you again on ${formattedDate} at ${formattedTime}.`)
    currentState = 'time_scheduled'
  }
  updateDataflow()
}

function handleDateTimeCancel() {
  const modal = document.getElementById('dateTimeModal')
  if (modal) {
    modal.style.display = 'none'
  }
  
  if (currentState === 'confirm_visit_reschedule_selecting_time') {
    currentState = 'confirm_visit_reschedule_waiting'
    updateDataflow()
    setTimeout(() => {
      const options = ['Yes', 'No']
      addMessage('bot', 'Is there a better time we could reschedule the appointment for?', options)
    }, 500)
    return
  }
  
  // Ask if they want to select a date and time
  currentState = 'asking_after_cancel'
  updateDataflow()
  setTimeout(() => {
    const options = ['Yes', 'No']
    addMessage('bot', 'No date and time selected. Would you like to select a date and time for us to call you back?', options)
  }, 500)
}

function handleEndCall() {
  hideCallScreen()
  addMessage('bot', 'Thank you for calling us! We will keep in contact using this number.')
  // Keep state as 'call_accepted' so dataflow stays on 'does_answer' instead of going to DNC
  // currentState = 'ended' // Don't change state to ended
  // updateDataflow() // Don't update dataflow
}

function handleMuteToggle() {
  isMuted = !isMuted
  const muteBtn = document.getElementById('muteBtn')
  
  if (muteBtn) {
    if (isMuted) {
      muteBtn.classList.add('active')
      muteBtn.title = 'Unmute'
    } else {
      muteBtn.classList.remove('active')
      muteBtn.title = 'Mute'
    }
  }
}

function handleSpeakerToggle() {
  isSpeakerOn = !isSpeakerOn
  const speakerBtn = document.getElementById('speakerBtn')
  
  if (speakerBtn) {
    if (isSpeakerOn) {
      speakerBtn.classList.add('active')
      speakerBtn.title = 'Speaker Off'
    } else {
      speakerBtn.classList.remove('active')
      speakerBtn.title = 'Speaker'
    }
  }
}

function handleKeypadToggle() {
  isKeypadVisible = !isKeypadVisible
  const keypadBtn = document.getElementById('keypadBtn')
  
  if (keypadBtn) {
    if (isKeypadVisible) {
      keypadBtn.classList.add('active')
      keypadBtn.title = 'Hide Keypad'
      showKeypad()
    } else {
      keypadBtn.classList.remove('active')
      keypadBtn.title = 'Keypad'
      hideKeypad()
    }
  }
}

function showKeypad() {
  const keypadOverlay = document.getElementById('keypadOverlay')
  if (keypadOverlay) {
    keypadOverlay.style.display = 'flex'
    updateKeypadDisplay()
    
    // Set up keypad key listeners
    document.querySelectorAll('.keypad-key').forEach(btn => {
      btn.removeEventListener('click', handleKeypadKeyClick)
      btn.addEventListener('click', handleKeypadKeyClick)
    })
  }
}

function handleKeypadKeyClick(e: Event) {
  const key = (e.currentTarget as HTMLElement).dataset.key
  if (key) {
    handleKeypadKeyPress(key)
  }
}

function hideKeypad() {
  const keypadOverlay = document.getElementById('keypadOverlay')
  if (keypadOverlay) {
    keypadOverlay.style.display = 'none'
  }
  isKeypadVisible = false
  const keypadBtn = document.getElementById('keypadBtn')
  if (keypadBtn) {
    keypadBtn.classList.remove('active')
    keypadBtn.title = 'Keypad'
  }
}

function handleKeypadKeyPress(key: string) {
  keypadInput += key
  updateKeypadDisplay()
  
  // Add haptic-like feedback (visual)
  const keyElement = document.querySelector(`[data-key="${key}"]`) as HTMLElement
  if (keyElement) {
    keyElement.style.transform = 'scale(0.95)'
    setTimeout(() => {
      keyElement.style.transform = ''
    }, 100)
  }
}

function handleKeypadDelete() {
  if (keypadInput.length > 0) {
    keypadInput = keypadInput.slice(0, -1)
    updateKeypadDisplay()
  }
}

function updateKeypadDisplay() {
  const display = document.getElementById('keypadDisplay')
  if (display) {
    display.textContent = keypadInput || ''
  }
}

function handleAddCall() {
  const addCallBtn = document.getElementById('addCallBtn')
  if (addCallBtn) {
    addCallBtn.classList.toggle('active')
  }
}

function handleFaceTime() {
  const faceTimeBtn = document.getElementById('faceTimeBtn')
  if (faceTimeBtn) {
    faceTimeBtn.classList.toggle('active')
  }
}

function handleContacts() {
  const contactsBtn = document.getElementById('contactsBtn')
  if (contactsBtn) {
    const isActive = contactsBtn.classList.contains('active')
    if (isActive) {
      contactsBtn.classList.remove('active')
      hideContacts()
    } else {
      contactsBtn.classList.add('active')
      showContacts()
    }
  }
}

function showContacts() {
  const contactsOverlay = document.getElementById('contactsOverlay')
  if (contactsOverlay) {
    contactsOverlay.style.display = 'flex'
  }
}

function hideContacts() {
  const contactsOverlay = document.getElementById('contactsOverlay')
  if (contactsOverlay) {
    contactsOverlay.style.display = 'none'
  }
  const contactsBtn = document.getElementById('contactsBtn')
  if (contactsBtn) {
    contactsBtn.classList.remove('active')
  }
}

function showTimePassingAnimation() {
  const overlay = document.getElementById('timePassingOverlay')
  const progressBar = document.getElementById('timePassingBar')
  if (!overlay || !progressBar) return
  
  overlay.style.display = 'flex'
  progressBar.style.width = '0%'
  
  // Animate progress bar over 3 seconds (representing 24 hours)
  let progress = 0
  const duration = 3000 // 3 seconds
  const interval = 16 // ~60fps
  const increment = 100 / (duration / interval)
  
  const animationInterval = setInterval(() => {
    progress += increment
    if (progress >= 100) {
      progress = 100
      clearInterval(animationInterval)
      
      // Hide overlay and send follow-up message
      setTimeout(() => {
        overlay.style.display = 'none'
        // Re-send ADT intro each time 24 hours pass
        addMessage('bot', ADT_INTRO_MESSAGE)
        let message = 'Hello, we called yesterday to reach out about our product! Would you like to schedule a time for us to call you?'
        if (selectedWorkflow === 'product question') {
          message = 'Hello, we called yesterday about your product question. Would you like to schedule a time for us to call you?'
        }
        addMessage('bot', message)
        currentState = 'followup_next_day' // Set state to followup_next_day
        isAfter24HourFollowup = true // Set flag to indicate we're in the follow-up flow
        updateDataflow()
        
        setTimeout(() => {
          const options = ['Yes', 'No'] // "No" will loop back after 24 hours
          addMessage('bot', '', options)
        }, 500)
      }, 500)
    }
    progressBar.style.width = `${progress}%`
  }, interval)
}

function hideTimePassingAnimation() {
  const overlay = document.getElementById('timePassingOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }
}

function renderDataflow() {
  const diagram = document.getElementById('dataflowDiagram')
  if (!diagram) return
  
  // If "offer", "schedule consultation", "customer satisfaction check-in", or "legal requirements" workflow is selected, show blank diagram
  if (selectedWorkflow === 'offer' || selectedWorkflow === 'schedule consultation' || selectedWorkflow === 'customer satisfaction check-in' || selectedWorkflow === 'legal requirements') {
    diagram.innerHTML = ''
    return
  }
  
  // Handle "confirm visit" workflow
  if (selectedWorkflow === 'confirm visit') {
    renderConfirmVisitDataflow(diagram)
    return
  }
  
  // Handle "product question" workflow
  if (selectedWorkflow === 'product question') {
    renderProductQuestionDataflow(diagram)
    return
  }
  
  // Match the image structure: Blue rectangles (process), Orange rectangles (SMS), Green ovals (success), Red oval (DNC)
  const smsInitialLabel = selectedVersion === 'B'
    ? 'No SMS is sent to customer'
    : "SMS is sent to customer 'We received your interest form! We are calling now.'"
  const states = [
    { id: 'webform_received', label: 'Webform received', type: 'blue', x: 500, y: 50 },
    { id: 'sms_initial', label: smsInitialLabel, type: 'orange', x: 500, y: 200, ...(selectedVersion === 'B' ? { width: 300, height: 80 } : {}) },
    { id: 'outbound_call', label: 'Outbound call attempt is made to lead', type: 'blue', x: 500, y: 350 },
    { id: 'does_answer', label: 'Does answer', type: 'green', x: 200, y: 500 },
    { id: 'lead_no_answer', label: "Lead doesn't answer call", type: 'blue', x: 500, y: 500 },
    { id: 'unknown', label: 'Unknown', type: 'red', x: 150, y: 660 },
    { id: 'sms_followup', label: "SMS is sent to lead 'Hello Lead, do you want to be called?'", type: 'orange', x: 500, y: 650 },
    { id: 'redial_lead', label: 'Redial lead', type: 'green', x: 50, y: 875 },
    { id: 'schedule_call', label: 'Schedule Call', type: 'green', x: 200, y: 950 },
    { id: 'better_time', label: 'Is there a better time we can call you?', type: 'blue', x: 350, y: 950 },
    { id: 'followup_next_day', label: 'Followup next day', type: 'blue', x: 880, y: 950 },
    { id: 'dnc', label: 'DNC', type: 'red', x: 1050, y: 660 }
  ]
  
  const connections = [
    { from: 'webform_received', to: 'sms_initial', label: '' },
    { from: 'sms_initial', to: 'outbound_call', label: '' },
    { from: 'outbound_call', to: 'does_answer', label: '' },
    { from: 'outbound_call', to: 'lead_no_answer', label: '' },
    { from: 'lead_no_answer', to: 'sms_followup', label: '' },
    { from: 'sms_followup', to: 'unknown', label: 'Unknown message sent' },
    { from: 'sms_followup', to: 'redial_lead', label: 'Yes' },
    { from: 'sms_followup', to: 'schedule_call', label: 'Can you call at ???' },
    { from: 'sms_followup', to: 'better_time', label: 'No' },
    { from: 'sms_followup', to: 'followup_next_day', label: 'No response' },
    { from: 'sms_followup', to: 'dnc', label: 'Do not contact' },
    { from: 'better_time', to: 'schedule_call', label: 'Yes' },
    { from: 'better_time', to: 'followup_next_day', label: 'No' },
    { from: 'followup_next_day', to: 'better_time', label: 'Yes' },
    { from: 'followup_next_day', to: 'followup_next_day', label: 'No/No response' }
  ]
  
  // Map current state to diagram state
  const stateMapping: Record<ConversationState, string> = {
    'initial': 'webform_received',
    'calling': 'outbound_call',
    'call_accepted': 'does_answer',
    'call_declined': 'lead_no_answer',
    'asking_if_wants_call': 'sms_followup',
    'waiting_for_response': 'sms_followup',
    'scheduling_time': 'schedule_call',
    'time_scheduled': 'schedule_call',
    'asking_better_time': 'better_time',
    'asking_after_cancel': 'better_time',
    'followup_next_day': 'followup_next_day',
    'unknown': 'unknown',
    'ended': 'dnc',
    // Confirm visit states (not used in webform workflow, but required for type completeness)
    'confirm_visit_initial': 'webform_received',
    'confirm_visit_waiting': 'webform_received',
    'confirm_visit_confirmed': 'webform_received',
    'confirm_visit_reschedule_question': 'webform_received',
    'confirm_visit_reschedule_waiting': 'webform_received',
    'confirm_visit_reschedule_selecting_time': 'webform_received',
    'confirm_visit_cancelled': 'webform_received',
    'confirm_visit_dnc': 'webform_received'
  }
  
  const activeStateId = stateMapping[currentState] || ''
  
  const stateMap = new Map(states.map(s => [s.id, s]))
  
  // Helper function to wrap text
  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''
    
    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      // Approximate width: each character is about 0.6 * fontSize
      const testWidth = testLine.length * fontSize * 0.6
      
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    })
    
    if (currentLine) {
      lines.push(currentLine)
    }
    
    return lines.length > 0 ? lines : [text]
  }
  
  // Get colors and shapes based on type
  const getNodeStyle = (state: typeof states[0], isActive: boolean) => {
    const baseColors: Record<string, { fill: string, stroke: string, text: string }> = {
      'blue': { fill: '#4A90E2', stroke: '#357ABD', text: 'white' },
      'orange': { fill: '#F5A623', stroke: '#D68910', text: 'white' },
      'green': { fill: '#7ED321', stroke: '#5BA617', text: 'white' },
      'red': { fill: '#D0021B', stroke: '#A00115', text: 'white' }
    }
    
    const colors = baseColors[state.type] || baseColors.blue
    const isOval = state.type === 'green' || state.type === 'red'
    
    return { colors, isOval }
  }
  
  let svg = `
    <svg class="dataflow-svg" viewBox="0 0 1300 1400" xmlns="http://www.w3.org/2000/svg">
      <!-- Draw connections -->
      ${connections.map(conn => {
        const from = stateMap.get(conn.from)!
        const to = stateMap.get(conn.to)!
        
        // Special case: better_time to dnc - point to top midpoint of DNC circle
        if (conn.from === 'better_time' && conn.to === 'dnc') {
          // better_time is a blue rectangle (300x80)
          const fromWidth = 300
          const fromHeight = 80
          
          // dnc is a red oval (120x60)
          const toWidth = 120
          const toHeight = 60
          
          // Start from 2/3 across on the right side of better_time
          const startX = from.x + (fromWidth * 2/3)
          const startY = from.y + (fromHeight / 2)
          
          // End at top midpoint of DNC circle
          const endX = to.x + (toWidth / 2)
          const endY = to.y
          
          // Label position at the middle of the line
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label.length * 7 + 16 // Approximate width based on text length
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: sms_followup to unknown - draw from middle left side to right side of Unknown circle
        if (conn.from === 'sms_followup' && conn.to === 'unknown') {
          // sms_followup is an orange rectangle (300x80)
          const fromWidth = 300
          const fromHeight = 80
          
          // unknown is a red oval (120x60)
          const toWidth = 120
          const toHeight = 60
          
          // Start from middle left side of sms_followup
          const startX = from.x
          const startY = from.y + (fromHeight / 2)
          
          // End at right side of Unknown circle
          const endX = to.x + toWidth
          const endY = to.y + (toHeight / 2)
          
          // Label position at the middle of the line
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: sms_followup to dnc - draw from middle right side to left side of DNC circle
        if (conn.from === 'sms_followup' && conn.to === 'dnc') {
          // sms_followup is an orange rectangle (300x80)
          const fromWidth = 300
          const fromHeight = 80
          
          // dnc is a red oval (120x60)
          const toWidth = 120
          const toHeight = 60
          
          // Start from middle right side of sms_followup
          const startX = from.x + fromWidth
          const startY = from.y + (fromHeight / 2)
          
          // End at left side of DNC circle
          const endX = to.x
          const endY = to.y + (toHeight / 2)
          
          // Label position at the middle of the line
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: better_time to followup_next_day - draw from top 1/5 of right side to top 1/5 of left side
        if (conn.from === 'better_time' && conn.to === 'followup_next_day') {
          // better_time is a blue rectangle (300x80)
          const fromWidth = 300
          const fromHeight = 80
          
          // followup_next_day is a blue rectangle (300x80)
          const toWidth = 300
          const toHeight = 80
          
          // Start from top 1/5 of right side of better_time
          const startX = from.x + fromWidth
          const startY = from.y + (fromHeight / 5)
          
          // End at top 1/5 of left side of followup_next_day
          const endX = to.x
          const endY = to.y + (toHeight / 5)
          
          // Label position at the middle of the line
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: followup_next_day to better_time - draw from bottom 1/5 to bottom 1/5 of right side
        if (conn.from === 'followup_next_day' && conn.to === 'better_time') {
          // followup_next_day is a blue rectangle (300x80)
          const fromWidth = 300
          const fromHeight = 80
          
          // better_time is a blue rectangle (300x80)
          const toWidth = 300
          const toHeight = 80
          
          // Start from bottom 1/5 of followup_next_day
          const startX = from.x + (fromWidth / 2)
          const startY = from.y + fromHeight - (fromHeight / 5)
          
          // End at bottom 1/5 of right side of better_time
          const endX = to.x + toWidth
          const endY = to.y + toHeight - (toHeight / 5)
          
          // Label position at the middle of the line, offset 75px to the left
          const midX = (startX + endX) / 2 - 75
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: followup_next_day self-loop for "No/No response"
        if (conn.from === 'followup_next_day' && conn.to === 'followup_next_day') {
          // followup_next_day is a blue rectangle (300x80)
          const fromWidth = 300
          const fromHeight = 80
          
          // Draw a smooth circular clockwise loop: start from right side middle, loop down in a circle, end at bottom middle
          const startX = from.x + fromWidth
          const startY = from.y + (fromHeight / 2)
          const endX = from.x + (fromWidth / 2)
          const endY = from.y + fromHeight
          
          // Create a smooth circular arc using a single cubic bezier curve
          // The arc should go from right side middle, curve down and around in a circle, to bottom middle
          const radius = 80 // Radius of the circular motion
          
          // Control points for a smooth circular arc
          // These create a nice quarter-circle or larger arc
          const control1X = from.x + fromWidth + radius * 0.5
          const control1Y = from.y + fromHeight / 2 + radius * 0.3
          const control2X = from.x + fromWidth / 2 + radius * 0.3
          const control2Y = from.y + fromHeight + radius * 0.5
          
          // Calculate a point along the bezier curve for label positioning (at t=0.5, midpoint)
          // Bezier curve formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
          const t = 0.5 // Midpoint of the curve
          const mt = 1 - t
          const labelX = mt * mt * mt * startX + 3 * mt * mt * t * control1X + 3 * mt * t * t * control2X + t * t * t * endX
          const labelY = mt * mt * mt * startY + 3 * mt * mt * t * control1Y + 3 * mt * t * t * control2Y + t * t * t * endY + 15
          
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${labelX - labelWidth / 2}" y="${labelY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${labelX}" y="${labelY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <path d="M ${startX} ${startY} 
                     C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${endX} ${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: better_time to schedule_call - draw from bottom with 90 degree bend
        if (conn.from === 'better_time' && conn.to === 'schedule_call') {
          const fromIsOval = from.type === 'green' || from.type === 'red'
          const toIsOval = to.type === 'green' || to.type === 'red'
          
          const fromWidth = fromIsOval ? 120 : 300
          const fromHeight = fromIsOval ? 60 : 80
          const toWidth = toIsOval ? 120 : 300
          const toHeight = toIsOval ? 60 : 80
          
          // Start from bottom center of better_time
          const startX = from.x + (fromWidth / 2)
          const startY = from.y + fromHeight
          
          // Go down a bit, then bend left (since schedule_call is to the left)
          const bendY = startY + 50 // Distance down before bend
          const bendX = to.x + (toWidth / 2) // X position at center of schedule_call
          
          // End at bottom center of schedule_call circle
          const endX = to.x + (toWidth / 2)
          const endY = to.y + toHeight
          
          // Label position at the horizontal segment
          const labelX = (startX + bendX) / 2
          const labelY = bendY
          
          const labelWidth = conn.label.length * 7 + 16 // Approximate width based on text length
          const labelHtml = conn.label ? `
            <rect x="${labelX - labelWidth / 2}" y="${labelY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${labelX}" y="${labelY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <path d="M ${startX} ${startY} L ${startX} ${bendY} L ${bendX} ${bendY} L ${endX} ${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Default connection drawing
        const dx = to.x - from.x
        const dy = to.y - from.y
        const angle = Math.atan2(dy, dx)
        
        // Calculate connection points based on node type
        const fromIsOval = from.type === 'green' || from.type === 'red'
        const toIsOval = to.type === 'green' || to.type === 'red'
        
        const fromWidth = fromIsOval ? 120 : 300
        const fromHeight = fromIsOval ? 60 : 80
        const toWidth = toIsOval ? 120 : 300
        const toHeight = toIsOval ? 60 : 80
        
        const startX = from.x + (fromWidth / 2) + Math.cos(angle) * (fromIsOval ? 60 : 150)
        const startY = from.y + (fromHeight / 2) + Math.sin(angle) * (fromIsOval ? 30 : 40)
        const endX = to.x + (toWidth / 2) - Math.cos(angle) * (toIsOval ? 60 : 150)
        const endY = to.y + (toHeight / 2) - Math.sin(angle) * (toIsOval ? 30 : 40)
        
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2
        
        // Only show label if it's not empty
        const labelWidth = conn.label ? conn.label.length * 7 + 16 : 0 // Approximate width based on text length
        const labelHtml = conn.label ? `
          <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
          <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
        ` : ''
        
        return `
          <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
          ${labelHtml}
        `
      }).join('')}
      
      <!-- Draw states -->
      ${states.map(state => {
        const isActive = activeStateId === state.id
        const { colors, isOval } = getNodeStyle(state, isActive)
        const width = (state as { width?: number }).width ?? (isOval ? 120 : 300)
        const fontSize = isOval ? 18 : 16
        
        // Wrap text for rectangular nodes
        const textLines = isOval ? [state.label] : wrapText(state.label, width - 20, fontSize)
        const lineHeight = fontSize + 4
        const minHeight = isOval ? 60 : 80
        const textHeight = textLines.length * lineHeight
        const height = (state as { height?: number }).height ?? Math.max(minHeight, textHeight + 20) // Add padding (use fixed height when set to keep box size)
        const rx = isOval ? 60 : 10
        
        const textStartY = state.y + (height / 2) - (textHeight / 2) + fontSize - 6
        
        return `
          <g class="state-group ${isActive ? 'active' : ''}" data-state-id="${state.id}" style="cursor: pointer;">
            ${isOval ? `
              <ellipse cx="${state.x + width/2}" cy="${state.y + height/2}" rx="${width/2}" ry="${height/2}" 
                      class="state-box" fill="${isActive ? colors.fill : (state.type === 'green' ? '#E8F5E9' : state.type === 'red' ? '#FFEBEE' : colors.fill)}" 
                      stroke="${isActive ? colors.stroke : '#ccc'}" stroke-width="${isActive ? '3' : '2'}"/>
            ` : `
              <rect x="${state.x}" y="${state.y}" width="${width}" height="${height}" 
                    rx="${rx}" class="state-box" fill="${isActive ? colors.fill : (state.type === 'blue' ? '#E3F2FD' : '#FFF3E0')}" 
                    stroke="${isActive ? colors.stroke : '#ccc'}" stroke-width="${isActive ? '3' : '2'}"/>
            `}
            ${textLines.map((line, index) => `
              <text x="${state.x + width/2}" y="${textStartY + (index * lineHeight)}" 
                    class="state-label" fill="${isActive ? colors.text : (state.type === 'blue' ? '#1976D2' : state.type === 'orange' ? '#E65100' : '#333')}" 
                    font-size="${fontSize}" font-weight="${isActive ? '600' : '500'}" 
                    text-anchor="middle" dominant-baseline="middle">${line}</text>
            `).join('')}
          </g>
        `
      }).join('')}
      
      <!-- Arrow marker definition -->
      <defs>
        <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="11" refY="4" orient="auto">
          <polygon points="0 0, 12 4, 0 8" fill="#666" />
        </marker>
      </defs>
    </svg>
  `
  
  diagram.innerHTML = svg
  
  // Add zoom controls to the dataflow container (outside scrollable area)
  const dataflowContainer = document.querySelector('.dataflow-container')
  let zoomControls = document.getElementById('zoomControls')
  if (!zoomControls && dataflowContainer) {
    zoomControls = document.createElement('div')
    zoomControls.className = 'zoom-controls'
    zoomControls.id = 'zoomControls'
    zoomControls.innerHTML = `
      <button class="zoom-btn" id="zoomInBtn" title="Zoom In">+</button>
      <button class="zoom-btn" id="zoomOutBtn" title="Zoom Out">−</button>
      <button class="zoom-btn" id="zoomResetBtn" title="Reset Zoom">⌂</button>
    `
    dataflowContainer.appendChild(zoomControls)
  }
  
  // Set up zoom controls
  setupZoomControls()
  
  // Set up pan/drag functionality
  setupPanControls()
  
  // Set up click handlers for state boxes
  setupStateClickHandlers()
}

// Set up click handlers for confirm visit state boxes
function setupConfirmVisitStateClickHandlers() {
  const diagramToConversationState: Record<string, ConversationState> = {
    'cv_initial_sms': 'confirm_visit_initial',
    'cv_confirm_appointment': 'confirm_visit_confirmed',
    'cv_reschedule_appointment': 'confirm_visit_reschedule_question',
    'cv_reschedule_question': 'confirm_visit_reschedule_waiting',
    'cv_cancel_appointment': 'confirm_visit_cancelled',
    'cv_cancel_dnc': 'confirm_visit_dnc',
    'cv_unknown': 'unknown'
  }
  
  const stateGroups = document.querySelectorAll('.state-group')
  stateGroups.forEach(group => {
    group.addEventListener('click', (e) => {
      e.stopPropagation()
      const stateId = (group as HTMLElement).dataset.stateId
      if (stateId && diagramToConversationState[stateId]) {
        const newState = diagramToConversationState[stateId]
        currentState = newState
        updatePhoneUIForConfirmVisit(newState)
        updateDataflow()
      }
    })
  })
}

// Update phone UI for confirm visit workflow
function updatePhoneUIForConfirmVisit(state: ConversationState) {
  messages.length = 0
  const container = document.getElementById('messagesContainer')
  if (container) {
    container.innerHTML = ''
  }
  
  hideCallingNotification()
  hideCallScreen()
  hideKeypad()
  hideContacts()
  const modal = document.getElementById('dateTimeModal')
  if (modal) {
    modal.style.display = 'none'
  }
  clearInputArea()
  
  const fName = 'John'
  const appointmentDate = new Date()
  appointmentDate.setDate(appointmentDate.getDate() + 1)
  const dateTime = appointmentDate.toLocaleString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  const address = '123 Main Street, Anytown, ST 12345'
  
  switch (state) {
    case 'confirm_visit_initial':
    case 'confirm_visit_waiting':
      const initialMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
      setTimeout(() => {
        const options = ['Yes', 'No', 'Cancel Appointment', 'DNC', 'Unknown message']
        addMessage('bot', initialMessage, options)
      }, 500)
      break
      
    case 'confirm_visit_confirmed':
      const confirmMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
      setTimeout(() => {
        addMessage('bot', confirmMessage)
        setTimeout(() => {
          addMessage('user', 'Yes')
          setTimeout(() => {
            addMessage('bot', 'Great! We will see you then.')
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'confirm_visit_reschedule_question':
    case 'confirm_visit_reschedule_waiting':
      const rescheduleMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
      setTimeout(() => {
        addMessage('bot', rescheduleMessage)
        setTimeout(() => {
          addMessage('user', 'No')
          setTimeout(() => {
            const options = ['Yes', 'No']
            addMessage('bot', 'Is there a better time we could reschedule the appointment for?', options)
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'confirm_visit_reschedule_selecting_time':
      const rescheduleSelectingMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
      setTimeout(() => {
        addMessage('bot', rescheduleSelectingMessage)
        setTimeout(() => {
          addMessage('user', 'No')
          setTimeout(() => {
            const options = ['Yes', 'No']
            addMessage('bot', 'Is there a better time we could reschedule the appointment for?', options)
            setTimeout(() => {
              addMessage('user', 'Yes')
              setTimeout(() => {
                showConfirmVisitRescheduleDateTimePicker()
              }, 500)
            }, 500)
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'confirm_visit_cancelled':
      const cancelMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
      setTimeout(() => {
        addMessage('bot', cancelMessage)
        setTimeout(() => {
          addMessage('user', 'Cancel Appointment')
          setTimeout(() => {
            addMessage('bot', 'Is there a better time we could reschedule the appointment for?')
            setTimeout(() => {
              addMessage('user', 'No')
              setTimeout(() => {
                addMessage('bot', 'Your appointment has been canceled, please reach out if you would like to reschedule.')
              }, 500)
            }, 500)
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'confirm_visit_dnc':
      const dncMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
      setTimeout(() => {
        addMessage('bot', dncMessage)
        setTimeout(() => {
          addMessage('user', 'DNC')
          setTimeout(() => {
            addMessage('bot', 'Your appointment has been canceled and you will no longer receive notifications from this number.')
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'unknown':
      const unknownMessage = `Hey ${fName}, you have a consultation scheduled for ${dateTime} at ${address}. A certified technician will be arriving. Will you be available for this appointment?`
      setTimeout(() => {
        addMessage('bot', unknownMessage)
        setTimeout(() => {
          addMessage('user', 'Unknown message')
          setTimeout(() => {
            addMessage('bot', 'Unknown message received, transferring to messaging agent.')
          }, 500)
        }, 500)
      }, 500)
      break
  }
}

// Function to update phone UI based on conversation state
function updatePhoneUIForState(state: ConversationState) {
  // If confirm visit workflow, use the confirm visit UI handler
  if (selectedWorkflow === 'confirm visit') {
    updatePhoneUIForConfirmVisit(state)
    return
  }
  
  // If product question workflow, use the product question UI handler
  if (selectedWorkflow === 'product question') {
    updatePhoneUIForProductQuestion(state)
    return
  }
  
  // Clear messages
  messages.length = 0
  const container = document.getElementById('messagesContainer')
  if (container) {
    container.innerHTML = ''
  }
  
  // Hide all overlays and modals
  hideCallingNotification()
  hideCallScreen()
  hideKeypad()
  hideContacts()
  const modal = document.getElementById('dateTimeModal')
  if (modal) {
    modal.style.display = 'none'
  }
  clearInputArea()
  
  // Update based on state (version B omits "We received your interest form!" message)
  switch (state) {
    case 'initial':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      break
      
    case 'calling':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      showCallingNotification()
      break
      
    case 'call_accepted':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        showCallScreen()
      }, 500)
      break
      
    case 'call_declined':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        const options = ['Yes', 'Call at a different time', 'No', '24 hours later (No response)', 'Do not contact', 'Unknown message']
        addMessage('bot', 'Hello, we just called to reach out about our product! Would you like us to call you back?', options)
      }, 500)
      break
      
    case 'asking_if_wants_call':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        const options = ['Yes', 'Call at a different time', 'No', '24 hours later (No response)', 'Do not contact', 'Unknown message']
        addMessage('bot', 'Hello, we just called to reach out about our product! Would you like us to call you back?', options)
      }, 500)
      break
      
    case 'waiting_for_response':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        const options = ['Yes', 'Call at a different time', 'No', '24 hours later (No response)', 'Do not contact', 'Unknown message']
        addMessage('bot', 'Hello, we just called to reach out about our product! Would you like us to call you back?', options)
      }, 500)
      break
      
    case 'followup_next_day':
      // Show the 24-hour follow-up message
      addMessage('bot', 'Hello, we called yesterday to reach out about our product! Would you like to schedule a time for us to call you?')
      setTimeout(() => {
        const options = ['Yes', 'No'] // "No" will loop back after 24 hours
        addMessage('bot', '', options)
      }, 500)
      break
      
    case 'scheduling_time':
    case 'time_scheduled':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        addMessage('bot', 'Hello, we just called to reach out about our product! Would you like us to call you back?')
        setTimeout(() => {
          addMessage('user', 'Call at a different time')
          setTimeout(() => {
            if (scheduledDateTime) {
              const formattedDate = scheduledDateTime.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })
              const formattedTime = scheduledDateTime.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              })
              addMessage('bot', `We will call you again on ${formattedDate} at ${formattedTime}.`)
            } else {
              showDateTimePicker()
            }
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'asking_better_time':
    case 'asking_after_cancel':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        addMessage('bot', 'Hello, we just called to reach out about our product! Would you like us to call you back?')
        setTimeout(() => {
          addMessage('user', 'No')
          setTimeout(() => {
            const options = ['Yes', 'No']
            addMessage('bot', 'Is there a better time that we can call you?', options)
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'unknown':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        addMessage('bot', 'Hello, we just called to reach out about our product! Would you like us to call you back?')
        setTimeout(() => {
          addMessage('user', 'Unknown message')
          setTimeout(() => {
            addMessage('bot', 'Unknown message received, transferring to messaging agent.')
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'ended':
      if (selectedVersion === 'A') {
        addMessage('bot', 'We received your interest form! We are calling now.')
      }
      setTimeout(() => {
        addMessage('bot', 'Have a nice day!')
      }, 500)
      break
  }
}

// Set up click handlers for state boxes in the dataflow diagram
function setupStateClickHandlers() {
  // Reverse mapping from diagram state IDs to conversation states (for webform)
  const diagramToConversationState: Record<string, ConversationState> = {
    'webform_received': 'initial',
    'sms_initial': 'calling', // Show the initial SMS and calling state
    'outbound_call': 'calling',
    'does_answer': 'call_accepted',
    'lead_no_answer': 'call_declined',
    'sms_followup': 'waiting_for_response',
    'redial_lead': 'calling', // Show calling state
    'schedule_call': 'scheduling_time',
    'better_time': 'asking_better_time',
    'followup_next_day': 'followup_next_day', // Show the 24-hour follow-up message with options
    'unknown': 'unknown',
    'dnc': 'ended'
  }
  
  // Add click listeners to all state groups
  const stateGroups = document.querySelectorAll('.state-group')
  stateGroups.forEach(group => {
    group.addEventListener('click', (e) => {
      e.stopPropagation() // Prevent triggering pan
      const stateId = (group as HTMLElement).dataset.stateId
      if (stateId && diagramToConversationState[stateId]) {
        const newState = diagramToConversationState[stateId]
        currentState = newState
        
        // Set flag if clicking on followup_next_day
        if (stateId === 'followup_next_day') {
          isAfter24HourFollowup = true
        } else {
          // Reset flag for other states
          isAfter24HourFollowup = false
        }
        
        updatePhoneUIForState(newState)
        updateDataflow() // Update diagram to show new active state
      }
    })
  })
}

let currentZoom = 1
const minZoom = 0.5
const maxZoom = 3
const zoomStep = 0.15

function setupZoomControls() {
  const svg = document.querySelector('.dataflow-svg') as SVGSVGElement
  if (!svg) return
  
  // Remove existing listeners by cloning and replacing buttons
  const zoomInBtn = document.getElementById('zoomInBtn')
  const zoomOutBtn = document.getElementById('zoomOutBtn')
  const zoomResetBtn = document.getElementById('zoomResetBtn')
  
  // Clone buttons to remove old event listeners
  const newZoomIn = zoomInBtn?.cloneNode(true) as HTMLButtonElement
  const newZoomOut = zoomOutBtn?.cloneNode(true) as HTMLButtonElement
  const newZoomReset = zoomResetBtn?.cloneNode(true) as HTMLButtonElement
  
  if (zoomInBtn && newZoomIn) {
    zoomInBtn.parentNode?.replaceChild(newZoomIn, zoomInBtn)
  }
  if (zoomOutBtn && newZoomOut) {
    zoomOutBtn.parentNode?.replaceChild(newZoomOut, zoomOutBtn)
  }
  if (zoomResetBtn && newZoomReset) {
    zoomResetBtn.parentNode?.replaceChild(newZoomReset, zoomResetBtn)
  }
  
  newZoomIn?.addEventListener('click', () => {
    currentZoom = Math.min(currentZoom + zoomStep, maxZoom)
    updateZoom()
  })
  
  newZoomOut?.addEventListener('click', () => {
    currentZoom = Math.max(currentZoom - zoomStep, minZoom)
    updateZoom()
  })
  
  newZoomReset?.addEventListener('click', () => {
    currentZoom = 1
    updateZoom()
  })
  
  // Mouse wheel zoom - scroll wheel zooms in/out
  const diagram = document.getElementById('dataflowDiagram')
  const handleWheel = (e: WheelEvent) => {
    // Allow zoom with scroll wheel (Ctrl/Cmd modifier is optional, but regular scroll also works)
    // Prevent default scrolling behavior when zooming
    e.preventDefault()
    
    // Calculate zoom delta based on wheel direction
    // Scrolling down (positive deltaY) zooms out, scrolling up (negative deltaY) zooms in
    const zoomDirection = e.deltaY > 0 ? -1 : 1
    const delta = zoomDirection * zoomStep
    
    // Update zoom level
    currentZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom + delta))
    updateZoom()
  }
  
  // Remove old listener and add new one
  diagram?.removeEventListener('wheel', handleWheel as EventListener)
  diagram?.addEventListener('wheel', handleWheel as EventListener, { passive: false })
  
  function updateZoom() {
    if (svg) {
      svg.style.transform = `scale(${currentZoom})`
      svg.style.transformOrigin = 'top left'
    }
  }
  
  // Initialize zoom
  updateZoom()
}

// Pan/drag state
let isPanning = false
let panStartX = 0
let panStartY = 0
let scrollLeft = 0
let scrollTop = 0
const panSpeedMultiplier = 0.6 // Drag/pan speed (0.6 = faster dragging, scroll wheel zoom unaffected)

function setupPanControls() {
  const diagram = document.getElementById('dataflowDiagram')
  if (!diagram) return
  
  // Helper to check if target is interactive
  const isInteractiveElement = (target: HTMLElement): boolean => {
    // Check for zoom controls and buttons
    if (target.closest('.zoom-controls') || target.closest('button')) {
      return true
    }
    
    // For SVG elements, only block panning if clicking on actual state boxes or their text
    // Allow panning on SVG background, connections (lines/paths), and empty space
    const svgElement = target.closest('svg')
    if (svgElement) {
      // If clicking on a state group or state box, don't allow panning
      if (target.closest('.state-group') || target.closest('.state-box')) {
        return true
      }
      // If clicking on text that's part of a state, don't allow panning
      if (target.tagName === 'text' && target.closest('.state-group')) {
        return true
      }
      // Allow panning on everything else (SVG background, connections, etc.)
      return false
    }
    
    return false
  }
  
  // Mouse down - start panning
  diagram.addEventListener('mousedown', (e: MouseEvent) => {
    // Only start panning if clicking on the background, not on buttons or interactive elements
    const target = e.target as HTMLElement
    if (isInteractiveElement(target)) {
      return
    }
    
    isPanning = true
    panStartX = e.clientX
    panStartY = e.clientY
    // Capture current scroll position for both axes independently
    scrollLeft = diagram.scrollLeft
    scrollTop = diagram.scrollTop
    
    // Disable text selection and prevent default behaviors that might interfere
    diagram.style.cursor = 'grabbing'
    diagram.style.userSelect = 'none'
    e.preventDefault()
    e.stopPropagation()
    
    // Prevent any default scroll behaviors
    return false
  })
  
  // Mouse move - pan the view
  const handleMouseMove = (e: MouseEvent) => {
    if (isPanning) {
      // Prevent all default behaviors that might interfere with scrolling
      e.preventDefault()
      e.stopPropagation()
      
      // Calculate movement deltas for both axes independently
      const deltaX = (e.clientX - panStartX) * panSpeedMultiplier
      const deltaY = (e.clientY - panStartY) * panSpeedMultiplier
      
      // Calculate new scroll positions for both axes independently
      // Both calculations happen simultaneously, neither takes priority
      const newScrollLeft = scrollLeft - deltaX
      const newScrollTop = scrollTop - deltaY
      
      // Apply both scroll updates using scrollTo for more reliable cross-browser behavior
      // Both axes update together in a single operation - neither takes priority
      diagram.scrollTo({
        left: newScrollLeft,
        top: newScrollTop,
        behavior: 'auto'
      })
    } else {
      // Change cursor on hover (when not panning)
      const target = e.target as HTMLElement
      if (!isInteractiveElement(target)) {
        diagram.style.cursor = 'grab'
      } else {
        diagram.style.cursor = 'default'
      }
    }
  }
  
  // Also handle mouse move on document to ensure dragging works even if mouse leaves the element briefly
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (isPanning && diagram) {
      // Prevent all default behaviors
      e.preventDefault()
      e.stopPropagation()
      
      // Calculate movement deltas for both axes independently
      const deltaX = (e.clientX - panStartX) * panSpeedMultiplier
      const deltaY = (e.clientY - panStartY) * panSpeedMultiplier
      
      // Calculate new scroll positions for both axes independently
      const newScrollLeft = scrollLeft - deltaX
      const newScrollTop = scrollTop - deltaY
      
      // Apply both scroll updates using scrollTo for more reliable cross-browser behavior
      // Both axes update together in a single operation - neither takes priority
      diagram.scrollTo({
        left: newScrollLeft,
        top: newScrollTop,
        behavior: 'auto'
      })
    }
  })
  
  document.addEventListener('mouseup', () => {
    if (isPanning && diagram) {
      isPanning = false
      diagram.style.cursor = 'grab'
      diagram.style.userSelect = ''
    }
  })
  
  diagram.addEventListener('mousemove', handleMouseMove)
  
  // Mouse up - stop panning
  const handleMouseUp = () => {
    if (isPanning) {
      isPanning = false
      diagram.style.cursor = 'grab'
      diagram.style.userSelect = ''
    }
  }
  
  diagram.addEventListener('mouseup', handleMouseUp)
  
  // Mouse leave - stop panning if mouse leaves the area
  diagram.addEventListener('mouseleave', () => {
    if (isPanning) {
      isPanning = false
      diagram.style.cursor = 'grab'
      diagram.style.userSelect = ''
    }
  })
}

// Function to update dataflow when state changes
function updateDataflow() {
  renderDataflow()
}

// Render product question dataflow (similar structure to webform)
function renderConfirmVisitDataflow(diagram: HTMLElement) {
  // Based on the flowchart: Orange rectangles (SMS), Green ovals (success/confirm), Red ovals (cancel/DNC)
  const states = [
    { id: 'cv_customer_visit', label: 'Customer visit within 24 hours', type: 'blue', x: 400, y: -130, width: 500 },
    { id: 'cv_initial_sms', label: "Hey {fName}, you have a consultation scheduled for {date time} at {address}. A certified technician will be arriving. Will you be available for this appointment?", type: 'orange', x: 400, y: 50, width: 500 },
    { id: 'cv_confirm_appointment', label: 'Confirm Appointment', type: 'green', x: 710, y: 250, width: 150 },
    { id: 'cv_reschedule_appointment', label: 'Reschedule Appointment', type: 'green', x: 425, y: 250, width: 150 },
    { id: 'cv_reschedule_question', label: 'Is there a better time we could reschedule the appointment for?', type: 'blue', x: 500, y: 600 },
    { id: 'cv_cancel_appointment', label: 'Cancel Appointment', type: 'red', x: 900, y: 610, width: 150 },
    { id: 'cv_cancel_dnc', label: 'Cancel Appointment\nAdd to DNC List', type: 'red', x: 1056, y: 54, width: 160 },
    { id: 'cv_unknown', label: 'Unknown', type: 'red', x: 127, y: 73 }
  ]
  
  const connections = [
    { from: 'cv_customer_visit', to: 'cv_initial_sms', label: '' },
    { from: 'cv_initial_sms', to: 'cv_confirm_appointment', label: 'Yes' },
    { from: 'cv_initial_sms', to: 'cv_reschedule_appointment', label: 'No' },
    { from: 'cv_initial_sms', to: 'cv_reschedule_question', label: 'Cancel Appointment' },
    { from: 'cv_initial_sms', to: 'cv_cancel_dnc', label: 'DNC' },
    { from: 'cv_initial_sms', to: 'cv_unknown', label: 'Unknown' },
    { from: 'cv_reschedule_appointment', to: 'cv_reschedule_question', label: '' },
    { from: 'cv_reschedule_question', to: 'cv_confirm_appointment', label: 'Yes' },
    { from: 'cv_reschedule_question', to: 'cv_cancel_appointment', label: 'No' }
  ]
  
  // Map current state to diagram state for confirm visit
  const stateMapping: Record<ConversationState, string> = {
    'confirm_visit_initial': 'cv_initial_sms',
    'confirm_visit_waiting': 'cv_initial_sms',
    'confirm_visit_confirmed': 'cv_confirm_appointment',
    'confirm_visit_reschedule_question': 'cv_reschedule_question',
    'confirm_visit_reschedule_waiting': 'cv_reschedule_question',
    'confirm_visit_reschedule_selecting_time': 'cv_reschedule_question',
    'confirm_visit_cancelled': 'cv_cancel_appointment',
    'confirm_visit_dnc': 'cv_cancel_dnc',
    'unknown': 'cv_unknown',
    // Default mappings for other states (shouldn't occur in confirm visit workflow)
    'initial': 'cv_initial_sms',
    'calling': 'cv_initial_sms',
    'call_accepted': 'cv_initial_sms',
    'call_declined': 'cv_initial_sms',
    'asking_if_wants_call': 'cv_initial_sms',
    'waiting_for_response': 'cv_initial_sms',
    'scheduling_time': 'cv_initial_sms',
    'time_scheduled': 'cv_initial_sms',
    'asking_better_time': 'cv_initial_sms',
    'asking_after_cancel': 'cv_initial_sms',
    'followup_next_day': 'cv_initial_sms',
    'ended': 'cv_cancel_appointment'
  }
  
  const activeStateId = stateMapping[currentState] || 'cv_initial_sms'
  
  const stateMap = new Map(states.map(s => [s.id, s]))
  
  // Helper function to wrap text
  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''
    
    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const testWidth = testLine.length * fontSize * 0.6
      
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    })
    
    if (currentLine) {
      lines.push(currentLine)
    }
    
    return lines.length > 0 ? lines : [text]
  }
  
  // Get colors and shapes based on type
  const getNodeStyle = (state: typeof states[0], isActive: boolean) => {
    const baseColors: Record<string, { fill: string, stroke: string, text: string }> = {
      'blue': { fill: '#4A90E2', stroke: '#357ABD', text: 'white' },
      'orange': { fill: '#F5A623', stroke: '#D68910', text: 'white' },
      'green': { fill: '#7ED321', stroke: '#5BA617', text: 'white' },
      'red': { fill: '#D0021B', stroke: '#A00115', text: 'white' }
    }
    
    const colors = baseColors[state.type] || baseColors.blue
    const isOval = state.type === 'green' || state.type === 'red'
    
    return { colors, isOval }
  }
  
  // Render SVG
  let svg = `
    <svg class="dataflow-svg" viewBox="0 0 1300 800" xmlns="http://www.w3.org/2000/svg">
      <!-- Draw connections -->
      ${connections.map(conn => {
        const from = stateMap.get(conn.from)!
        const to = stateMap.get(conn.to)!
        
        const dx = to.x - from.x
        const dy = to.y - from.y
        const angle = Math.atan2(dy, dx)
        
        const fromIsOval = from.type === 'green' || from.type === 'red'
        const toIsOval = to.type === 'green' || to.type === 'red'
        
        const fromWidth = (from as any).width || (fromIsOval ? 120 : 300)
        const fromHeight = fromIsOval ? 60 : 80
        const toWidth = toIsOval ? 120 : 300
        const toHeight = toIsOval ? 60 : 80
        
        // Special handling for connection from customer visit to initial SMS
        if (conn.from === 'cv_customer_visit' && conn.to === 'cv_initial_sms') {
          // From bottom center of blue box to top of orange box, 100px to the right of center
          const startX = from.x + (fromWidth / 2)
          const startY = from.y + fromHeight
          const endX = to.x + (toWidth / 2) + 100
          const endY = to.y
          
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label ? conn.label.length * 7 + 16 : 0
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special handling for connections from initial SMS
        if (conn.from === 'cv_initial_sms') {
          let startX, startY
          if (conn.to === 'cv_confirm_appointment') {
            // Yes - bottom at 4/5 from left, moved 5px left
            startX = from.x + (fromWidth * 4 / 5) - 5
            startY = from.y + fromHeight
          } else if (conn.to === 'cv_reschedule_appointment') {
            // No - bottom at 1/5 from left (mirror of Yes)
            startX = from.x + (fromWidth / 5)
            startY = from.y + fromHeight
          } else if (conn.to === 'cv_reschedule_question') {
            // Cancel Appointment - goes to reschedule question (middle bottom)
            startX = from.x + (fromWidth / 2)
            startY = from.y + fromHeight
          } else if (conn.to === 'cv_cancel_dnc') {
            // DNC - middle right, horizontally to the right, moved down 10px (mirror of Unknown)
            startX = from.x + fromWidth
            startY = from.y + (fromHeight / 2) + 10
          } else if (conn.to === 'cv_unknown') {
            // Unknown - middle left, horizontally to the left, moved down 10px
            startX = from.x
            startY = from.y + (fromHeight / 2) + 10
          } else {
            startX = from.x + (fromWidth / 2) + Math.cos(angle) * (fromIsOval ? 60 : 150)
            startY = from.y + (fromHeight / 2) + Math.sin(angle) * (fromIsOval ? 30 : 40)
          }
          
          // Special handling for end point of Unknown, DNC, Confirm Appointment, and Reschedule Question connections
          let endX, endY
          if (conn.to === 'cv_reschedule_question') {
            // Cancel Appointment - end at top middle of blue box
            endX = to.x + (toWidth / 2)  // Center X of box
            endY = to.y  // Top of box
          } else if (conn.to === 'cv_confirm_appointment') {
            // Yes - end at top middle of ellipse, 22px to the right
            endX = to.x + (toWidth / 2) + 22  // Center X of ellipse + 22px
            endY = to.y  // Top of ellipse
          } else if (conn.to === 'cv_reschedule_appointment') {
            // No - end at top middle of ellipse, 12px to the right
            endX = to.x + (toWidth / 2) + 12  // Center X of ellipse + 12px
            endY = to.y  // Top of ellipse
          } else if (conn.to === 'cv_unknown') {
            // Unknown - end at right edge of ellipse
            endX = to.x + toWidth  // Right edge of ellipse (to.x + toWidth/2 + toWidth/2)
            endY = startY  // Keep same Y to ensure horizontal alignment
          } else if (conn.to === 'cv_cancel_dnc') {
            // DNC - end at left edge of ellipse (mirror of Unknown)
            endX = to.x  // Left edge of ellipse
            endY = startY  // Keep same Y to ensure horizontal alignment
          } else {
            const toRadiusX = toIsOval ? (toWidth / 2) : 150
            const toRadiusY = toIsOval ? (toHeight / 2) : 40
            endX = to.x + (toWidth / 2) - Math.cos(angle) * toRadiusX
            endY = to.y + (toHeight / 2) - Math.sin(angle) * toRadiusY
          }
          
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label ? conn.label.length * 7 + 16 : 0
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special handling for connection from reschedule question to confirm appointment
        if (conn.from === 'cv_reschedule_question' && conn.to === 'cv_confirm_appointment') {
          // Start from bottom of reschedule question box
          const fromWidthDefault = (from as any).width || (fromIsOval ? 120 : 300)
          const startX = from.x + (fromWidthDefault / 2)
          const startY = from.y + fromHeight
          
          // End at middle bottom of Confirm Appointment circle, 10px down
          const endX = to.x + (toWidth / 2)  // Center X of ellipse
          const endY = to.y + toHeight + 10  // Bottom of ellipse + 10px down
          
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          
          const labelWidth = conn.label ? conn.label.length * 7 + 16 : 0
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Default connection drawing
        const fromWidthDefault = (from as any).width || (fromIsOval ? 120 : 300)
        const fromRadiusX = fromIsOval ? (fromWidthDefault / 2) : 150
        const fromRadiusY = fromIsOval ? (fromHeight / 2) : 40
        const startX = from.x + (fromWidthDefault / 2) + Math.cos(angle) * fromRadiusX
        const startY = from.y + (fromHeight / 2) + Math.sin(angle) * fromRadiusY
        const toRadiusX = toIsOval ? (toWidth / 2) : 150
        const toRadiusY = toIsOval ? (toHeight / 2) : 40
        const endX = to.x + (toWidth / 2) - Math.cos(angle) * toRadiusX
        const endY = to.y + (toHeight / 2) - Math.sin(angle) * toRadiusY
        
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2
        
        const labelWidth = conn.label ? conn.label.length * 7 + 16 : 0
        const labelHtml = conn.label ? `
          <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
          <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
        ` : ''
        
        return `
          <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
          ${labelHtml}
        `
      }).join('')}
      
      <!-- Draw states -->
      ${states.map(state => {
        const isActive = activeStateId === state.id
        const { colors, isOval } = getNodeStyle(state, isActive)
        const width = (state as any).width || (isOval ? 120 : 300)
        const fontSize = isOval ? 16 : 14
        
        // Handle multi-line text (split by \n)
        const textLines = state.label.split('\n').flatMap(line => {
          if (isOval) {
            // For ovals, wrap text if it's too long for the width
            const maxTextWidth = width - 20
            const estimatedTextWidth = line.length * fontSize * 0.6
            if (estimatedTextWidth > maxTextWidth) {
              return wrapText(line, maxTextWidth, fontSize)
            }
            return [line]
          }
          return wrapText(line, width - 20, fontSize)
        })
        const lineHeight = fontSize + 4
        // For ovals, calculate height based on text width to make it bigger if needed
        const minHeight = isOval ? 60 : 80
        // For ovals with custom width, adjust height based on number of text lines
        // Calculate minimum height needed for text
        const textHeight = textLines.length * lineHeight
        const minOvalHeight = textHeight + 20 // Add padding
        // For ovals with custom width, use a proportional height or text-based height, whichever is larger
        const proportionalHeight = isOval && (state as any).width ? (state as any).width * 0.5 : minHeight
        const ovalHeight = isOval && (state as any).width ? Math.max(proportionalHeight, minOvalHeight) : Math.max(minHeight, minOvalHeight)
        const height = isOval ? ovalHeight : Math.max(minHeight, textHeight + 20)
        const rx = isOval ? (width / 2) : 10
        const ry = isOval ? (height / 2) : 10
        
        const textStartY = state.y + (height / 2) - (textHeight / 2) + fontSize - 6
        
        return `
          <g class="state-group ${isActive ? 'active' : ''}" data-state-id="${state.id}" style="cursor: pointer;">
            ${isOval ? `
              <ellipse cx="${state.x + width/2}" cy="${state.y + height/2}" rx="${rx}" ry="${ry}" 
                      class="state-box" fill="${isActive ? colors.fill : (state.type === 'green' ? '#E8F5E9' : state.type === 'red' ? '#FFEBEE' : colors.fill)}" 
                      stroke="${isActive ? colors.stroke : '#ccc'}" stroke-width="${isActive ? '3' : '2'}"/>
            ` : `
              <rect x="${state.x}" y="${state.y}" width="${width}" height="${height}" 
                    rx="${rx}" class="state-box" fill="${isActive ? colors.fill : (state.type === 'blue' ? '#E3F2FD' : '#FFF3E0')}" 
                    stroke="${isActive ? colors.stroke : '#ccc'}" stroke-width="${isActive ? '3' : '2'}"/>
            `}
            ${textLines.map((line, index) => `
              <text x="${state.x + width/2}" y="${textStartY + (index * lineHeight)}" 
                    class="state-label" fill="${isActive ? colors.text : (state.type === 'blue' ? '#1976D2' : state.type === 'orange' ? '#E65100' : '#333')}" 
                    font-size="${fontSize}" font-weight="${isActive ? '600' : '500'}" 
                    text-anchor="middle" dominant-baseline="middle">${line}</text>
            `).join('')}
          </g>
        `
      }).join('')}
      
      <!-- Arrow marker definition -->
      <defs>
        <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="11" refY="4" orient="auto">
          <polygon points="0 0, 12 4, 0 8" fill="#666" />
        </marker>
      </defs>
    </svg>
  `
  
  diagram.innerHTML = svg
  
  // Add zoom controls
  const dataflowContainer = document.querySelector('.dataflow-container')
  let zoomControls = document.getElementById('zoomControls')
  if (!zoomControls && dataflowContainer) {
    zoomControls = document.createElement('div')
    zoomControls.className = 'zoom-controls'
    zoomControls.id = 'zoomControls'
    zoomControls.innerHTML = `
      <button class="zoom-btn" id="zoomInBtn" title="Zoom In">+</button>
      <button class="zoom-btn" id="zoomOutBtn" title="Zoom Out">−</button>
      <button class="zoom-btn" id="zoomResetBtn" title="Reset Zoom">⌂</button>
    `
    dataflowContainer.appendChild(zoomControls)
  }
  
  setupZoomControls()
  setupPanControls()
  setupConfirmVisitStateClickHandlers()
}

function renderProductQuestionDataflow(diagram: HTMLElement) {
  // Match the webform structure: Blue rectangles (process), Orange rectangles (SMS), Green ovals (success), Red oval (DNC)
  const states = [
    { id: 'product_question_received', label: 'Product question received', type: 'blue', x: 500, y: 50 },
    { id: 'sms_initial_pq', label: "SMS is sent to customer 'We received your product question! We are calling now to help.'", type: 'orange', x: 500, y: 200 },
    { id: 'outbound_call_pq', label: 'Outbound call attempt is made to lead', type: 'blue', x: 500, y: 350 },
    { id: 'does_answer_pq', label: 'Does answer', type: 'green', x: 200, y: 500 },
    { id: 'lead_no_answer_pq', label: "Lead doesn't answer call", type: 'blue', x: 500, y: 500 },
    { id: 'unknown_pq', label: 'Unknown', type: 'red', x: 150, y: 660 },
    { id: 'sms_followup_pq', label: "SMS is sent to lead 'Hello, we received your product question. Would you like us to call you back to help?'", type: 'orange', x: 500, y: 650 },
    { id: 'redial_lead_pq', label: 'Redial lead', type: 'green', x: 50, y: 875 },
    { id: 'schedule_call_pq', label: 'Schedule Call', type: 'green', x: 200, y: 950 },
    { id: 'better_time_pq', label: 'Is there a better time we can call you?', type: 'blue', x: 350, y: 950 },
    { id: 'followup_next_day_pq', label: 'Followup next day', type: 'blue', x: 880, y: 950 },
    { id: 'dnc_pq', label: 'DNC', type: 'red', x: 1050, y: 660 }
  ]
  
  const connections = [
    { from: 'product_question_received', to: 'sms_initial_pq', label: '' },
    { from: 'sms_initial_pq', to: 'outbound_call_pq', label: '' },
    { from: 'outbound_call_pq', to: 'does_answer_pq', label: '' },
    { from: 'outbound_call_pq', to: 'lead_no_answer_pq', label: '' },
    { from: 'lead_no_answer_pq', to: 'sms_followup_pq', label: '' },
    { from: 'sms_followup_pq', to: 'unknown_pq', label: 'Unknown message sent' },
    { from: 'sms_followup_pq', to: 'redial_lead_pq', label: 'Yes' },
    { from: 'sms_followup_pq', to: 'schedule_call_pq', label: 'Call at a different time' },
    { from: 'sms_followup_pq', to: 'better_time_pq', label: 'No' },
    { from: 'sms_followup_pq', to: 'followup_next_day_pq', label: 'No response' },
    { from: 'sms_followup_pq', to: 'dnc_pq', label: 'Do not contact' },
    { from: 'better_time_pq', to: 'schedule_call_pq', label: 'Yes' },
    { from: 'better_time_pq', to: 'followup_next_day_pq', label: 'No' },
    { from: 'followup_next_day_pq', to: 'better_time_pq', label: 'Yes' },
    { from: 'followup_next_day_pq', to: 'followup_next_day_pq', label: 'No/No response' }
  ]
  
  // Map current state to diagram state for product question
  const stateMapping: Record<ConversationState, string> = {
    'initial': 'product_question_received',
    'calling': 'outbound_call_pq',
    'call_accepted': 'does_answer_pq',
    'call_declined': 'lead_no_answer_pq',
    'asking_if_wants_call': 'sms_followup_pq',
    'waiting_for_response': 'sms_followup_pq',
    'scheduling_time': 'schedule_call_pq',
    'time_scheduled': 'schedule_call_pq',
    'asking_better_time': 'better_time_pq',
    'asking_after_cancel': 'better_time_pq',
    'followup_next_day': 'followup_next_day_pq',
    'unknown': 'unknown_pq',
    'ended': 'dnc_pq',
    // Confirm visit states (not used in product question workflow, but required for type completeness)
    'confirm_visit_initial': 'product_question_received',
    'confirm_visit_waiting': 'product_question_received',
    'confirm_visit_confirmed': 'product_question_received',
    'confirm_visit_reschedule_question': 'product_question_received',
    'confirm_visit_reschedule_waiting': 'product_question_received',
    'confirm_visit_reschedule_selecting_time': 'product_question_received',
    'confirm_visit_cancelled': 'product_question_received',
    'confirm_visit_dnc': 'product_question_received'
  }
  
  const activeStateId = stateMapping[currentState] || ''
  
  const stateMap = new Map(states.map(s => [s.id, s]))
  
  // Helper function to wrap text
  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''
    
    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const testWidth = testLine.length * fontSize * 0.6
      
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    })
    
    if (currentLine) {
      lines.push(currentLine)
    }
    
    return lines.length > 0 ? lines : [text]
  }
  
  // Get colors and shapes based on type
  const getNodeStyle = (state: typeof states[0], isActive: boolean) => {
    const baseColors: Record<string, { fill: string, stroke: string, text: string }> = {
      'blue': { fill: '#4A90E2', stroke: '#357ABD', text: 'white' },
      'orange': { fill: '#F5A623', stroke: '#D68910', text: 'white' },
      'green': { fill: '#7ED321', stroke: '#5BA617', text: 'white' },
      'red': { fill: '#D0021B', stroke: '#A00115', text: 'white' }
    }
    
    const colors = baseColors[state.type] || baseColors.blue
    const isOval = state.type === 'green' || state.type === 'red'
    
    return { colors, isOval }
  }
  
  // Use the same SVG rendering logic as webform
  let svg = `
    <svg class="dataflow-svg" viewBox="0 0 1300 1400" xmlns="http://www.w3.org/2000/svg">
      <!-- Draw connections -->
      ${connections.map(conn => {
        const from = stateMap.get(conn.from)!
        const to = stateMap.get(conn.to)!
        
        // Special case: better_time_pq to dnc_pq - point to top midpoint of DNC circle
        if (conn.from === 'better_time_pq' && conn.to === 'dnc_pq') {
          const fromWidth = 300
          const fromHeight = 80
          const toWidth = 120
          const toHeight = 60
          const startX = from.x + (fromWidth * 2/3)
          const startY = from.y + (fromHeight / 2)
          const endX = to.x + (toWidth / 2)
          const endY = to.y
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: sms_followup_pq to unknown_pq
        if (conn.from === 'sms_followup_pq' && conn.to === 'unknown_pq') {
          const fromWidth = 300
          const fromHeight = 80
          const toWidth = 120
          const toHeight = 60
          const startX = from.x
          const startY = from.y + (fromHeight / 2)
          const endX = to.x + toWidth
          const endY = to.y + (toHeight / 2)
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: sms_followup_pq to dnc_pq
        if (conn.from === 'sms_followup_pq' && conn.to === 'dnc_pq') {
          const fromWidth = 300
          const fromHeight = 80
          const toWidth = 120
          const toHeight = 60
          const startX = from.x + fromWidth
          const startY = from.y + (fromHeight / 2)
          const endX = to.x
          const endY = to.y + (toHeight / 2)
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: better_time_pq to followup_next_day_pq
        if (conn.from === 'better_time_pq' && conn.to === 'followup_next_day_pq') {
          const fromWidth = 300
          const fromHeight = 80
          const toWidth = 300
          const toHeight = 80
          const startX = from.x + fromWidth
          const startY = from.y + (fromHeight / 5)
          const endX = to.x
          const endY = to.y + (toHeight / 5)
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: followup_next_day_pq to better_time_pq
        if (conn.from === 'followup_next_day_pq' && conn.to === 'better_time_pq') {
          const fromWidth = 300
          const fromHeight = 80
          const toWidth = 300
          const toHeight = 80
          const startX = from.x + (fromWidth / 2)
          const startY = from.y + fromHeight - (fromHeight / 5)
          const endX = to.x + toWidth
          const endY = to.y + toHeight - (toHeight / 5)
          const midX = (startX + endX) / 2 - 75
          const midY = (startY + endY) / 2
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          return `
            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: followup_next_day_pq self-loop
        if (conn.from === 'followup_next_day_pq' && conn.to === 'followup_next_day_pq') {
          const fromWidth = 300
          const fromHeight = 80
          const startX = from.x + fromWidth
          const startY = from.y + (fromHeight / 2)
          const endX = from.x + (fromWidth / 2)
          const endY = from.y + fromHeight
          const radius = 80
          const control1X = from.x + fromWidth + radius * 0.5
          const control1Y = from.y + fromHeight / 2 + radius * 0.3
          const control2X = from.x + fromWidth / 2 + radius * 0.3
          const control2Y = from.y + fromHeight + radius * 0.5
          const t = 0.5
          const mt = 1 - t
          const labelX = mt * mt * mt * startX + 3 * mt * mt * t * control1X + 3 * mt * t * t * control2X + t * t * t * endX
          const labelY = mt * mt * mt * startY + 3 * mt * mt * t * control1Y + 3 * mt * t * t * control2Y + t * t * t * endY + 15
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${labelX - labelWidth / 2}" y="${labelY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${labelX}" y="${labelY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          return `
            <path d="M ${startX} ${startY} 
                     C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${endX} ${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Special case: better_time_pq to schedule_call_pq
        if (conn.from === 'better_time_pq' && conn.to === 'schedule_call_pq') {
          const fromIsOval = from.type === 'green' || from.type === 'red'
          const toIsOval = to.type === 'green' || to.type === 'red'
          const fromWidth = fromIsOval ? 120 : 300
          const fromHeight = fromIsOval ? 60 : 80
          const toWidth = toIsOval ? 120 : 300
          const toHeight = toIsOval ? 60 : 80
          const startX = from.x + (fromWidth / 2)
          const startY = from.y + fromHeight
          const bendY = startY + 50
          const bendX = to.x + (toWidth / 2)
          const endX = to.x + (toWidth / 2)
          const endY = to.y + toHeight
          const labelX = (startX + bendX) / 2
          const labelY = bendY
          const labelWidth = conn.label.length * 7 + 16
          const labelHtml = conn.label ? `
            <rect x="${labelX - labelWidth / 2}" y="${labelY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
            <text x="${labelX}" y="${labelY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
          ` : ''
          return `
            <path d="M ${startX} ${startY} L ${startX} ${bendY} L ${bendX} ${bendY} L ${endX} ${endY}" 
                  class="dataflow-connection" stroke="#666" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>
            ${labelHtml}
          `
        }
        
        // Default connection drawing
        const dx = to.x - from.x
        const dy = to.y - from.y
        const angle = Math.atan2(dy, dx)
        const fromIsOval = from.type === 'green' || from.type === 'red'
        const toIsOval = to.type === 'green' || to.type === 'red'
        const fromWidth = fromIsOval ? 120 : 300
        const fromHeight = fromIsOval ? 60 : 80
        const toWidth = toIsOval ? 120 : 300
        const toHeight = toIsOval ? 60 : 80
        const startX = from.x + (fromWidth / 2) + Math.cos(angle) * (fromIsOval ? 60 : 150)
        const startY = from.y + (fromHeight / 2) + Math.sin(angle) * (fromIsOval ? 30 : 40)
        const endX = to.x + (toWidth / 2) - Math.cos(angle) * (toIsOval ? 60 : 150)
        const endY = to.y + (toHeight / 2) - Math.sin(angle) * (toIsOval ? 30 : 40)
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2
        const labelWidth = conn.label ? conn.label.length * 7 + 16 : 0
        const labelHtml = conn.label ? `
          <rect x="${midX - labelWidth / 2}" y="${midY - 12}" width="${labelWidth}" height="20" fill="white" opacity="0.95" rx="4" stroke="#ddd" stroke-width="1"/>
          <text x="${midX}" y="${midY + 2}" class="connection-label" fill="#333" font-size="12" font-weight="500" text-anchor="middle" dominant-baseline="middle">${conn.label}</text>
        ` : ''
        return `
          <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                class="dataflow-connection" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
          ${labelHtml}
        `
      }).join('')}
      
      <!-- Draw states -->
      ${states.map(state => {
        const isActive = activeStateId === state.id
        const { colors, isOval } = getNodeStyle(state, isActive)
        const width = isOval ? 120 : 300
        const fontSize = isOval ? 18 : 16
        const textLines = isOval ? [state.label] : wrapText(state.label, width - 20, fontSize)
        const lineHeight = fontSize + 4
        const minHeight = isOval ? 60 : 80
        const textHeight = textLines.length * lineHeight
        const height = Math.max(minHeight, textHeight + 20)
        const rx = isOval ? 60 : 10
        const textStartY = state.y + (height / 2) - (textHeight / 2) + fontSize - 6
        
        return `
          <g class="state-group ${isActive ? 'active' : ''}" data-state-id="${state.id}" style="cursor: pointer;">
            ${isOval ? `
              <ellipse cx="${state.x + width/2}" cy="${state.y + height/2}" rx="${width/2}" ry="${height/2}" 
                      class="state-box" fill="${isActive ? colors.fill : (state.type === 'green' ? '#E8F5E9' : state.type === 'red' ? '#FFEBEE' : colors.fill)}" 
                      stroke="${isActive ? colors.stroke : '#ccc'}" stroke-width="${isActive ? '3' : '2'}"/>
            ` : `
              <rect x="${state.x}" y="${state.y}" width="${width}" height="${height}" 
                    rx="${rx}" class="state-box" fill="${isActive ? colors.fill : (state.type === 'blue' ? '#E3F2FD' : '#FFF3E0')}" 
                    stroke="${isActive ? colors.stroke : '#ccc'}" stroke-width="${isActive ? '3' : '2'}"/>
            `}
            ${textLines.map((line, index) => `
              <text x="${state.x + width/2}" y="${textStartY + (index * lineHeight)}" 
                    class="state-label" fill="${isActive ? colors.text : (state.type === 'blue' ? '#1976D2' : state.type === 'orange' ? '#E65100' : '#333')}" 
                    font-size="${fontSize}" font-weight="${isActive ? '600' : '500'}" 
                    text-anchor="middle" dominant-baseline="middle">${line}</text>
            `).join('')}
          </g>
        `
      }).join('')}
      
      <!-- Arrow marker definition -->
      <defs>
        <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="11" refY="4" orient="auto">
          <polygon points="0 0, 12 4, 0 8" fill="#666" />
        </marker>
      </defs>
    </svg>
  `
  
  diagram.innerHTML = svg
  
  // Add zoom controls
  const dataflowContainer = document.querySelector('.dataflow-container')
  let zoomControls = document.getElementById('zoomControls')
  if (!zoomControls && dataflowContainer) {
    zoomControls = document.createElement('div')
    zoomControls.className = 'zoom-controls'
    zoomControls.id = 'zoomControls'
    zoomControls.innerHTML = `
      <button class="zoom-btn" id="zoomInBtn" title="Zoom In">+</button>
      <button class="zoom-btn" id="zoomOutBtn" title="Zoom Out">−</button>
      <button class="zoom-btn" id="zoomResetBtn" title="Reset Zoom">⌂</button>
    `
    dataflowContainer.appendChild(zoomControls)
  }
  
  setupZoomControls()
  setupPanControls()
  setupProductQuestionStateClickHandlers()
}

// Start product question conversation
function startProductQuestionConversation() {
  // Step 1: Initial SMS
  addMessage('bot', 'We received your product question! We are calling now to help.')
  
  setTimeout(() => {
    showCallingNotification()
  }, 1500)
}

// Set up click handlers for product question state boxes
function setupProductQuestionStateClickHandlers() {
  const diagramToConversationState: Record<string, ConversationState> = {
    'product_question_received': 'initial',
    'sms_initial_pq': 'calling',
    'outbound_call_pq': 'calling',
    'does_answer_pq': 'call_accepted',
    'lead_no_answer_pq': 'call_declined',
    'sms_followup_pq': 'waiting_for_response',
    'redial_lead_pq': 'calling',
    'schedule_call_pq': 'scheduling_time',
    'better_time_pq': 'asking_better_time',
    'followup_next_day_pq': 'followup_next_day',
    'unknown_pq': 'unknown',
    'dnc_pq': 'ended'
  }
  
  const stateGroups = document.querySelectorAll('.state-group')
  stateGroups.forEach(group => {
    group.addEventListener('click', (e) => {
      e.stopPropagation()
      const stateId = (group as HTMLElement).dataset.stateId
      if (stateId && diagramToConversationState[stateId]) {
        const newState = diagramToConversationState[stateId]
        currentState = newState
        
        if (stateId === 'followup_next_day_pq') {
          isAfter24HourFollowup = true
        } else {
          isAfter24HourFollowup = false
        }
        
        updatePhoneUIForProductQuestion(newState)
        updateDataflow()
      }
    })
  })
}

// Update phone UI for product question workflow
function updatePhoneUIForProductQuestion(state: ConversationState) {
  messages.length = 0
  const container = document.getElementById('messagesContainer')
  if (container) {
    container.innerHTML = ''
  }
  
  hideCallingNotification()
  hideCallScreen()
  hideKeypad()
  hideContacts()
  const modal = document.getElementById('dateTimeModal')
  if (modal) {
    modal.style.display = 'none'
  }
  clearInputArea()
  
  switch (state) {
    case 'initial':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      break
      
    case 'calling':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      showCallingNotification()
      break
      
    case 'call_accepted':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      setTimeout(() => {
        showCallScreen()
      }, 500)
      break
      
    case 'call_declined':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      setTimeout(() => {
        const options = ['Yes', 'Call at a different time', 'No', '24 hours later (No response)', 'Do not contact', 'Unknown message']
        addMessage('bot', 'Hello, we received your product question. Would you like us to call you back to help?', options)
      }, 500)
      break
      
    case 'waiting_for_response':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      setTimeout(() => {
        const options = ['Yes', 'Call at a different time', 'No', '24 hours later (No response)', 'Do not contact', 'Unknown message']
        addMessage('bot', 'Hello, we received your product question. Would you like us to call you back to help?', options)
      }, 500)
      break
      
    case 'followup_next_day':
      addMessage('bot', 'Hello, we called yesterday about your product question. Would you like to schedule a time for us to call you?')
      setTimeout(() => {
        const options = ['Yes', 'No']
        addMessage('bot', '', options)
      }, 500)
      break
      
    case 'scheduling_time':
    case 'time_scheduled':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      setTimeout(() => {
        addMessage('bot', 'Hello, we received your product question. Would you like us to call you back to help?')
        setTimeout(() => {
          addMessage('user', 'Call at a different time')
          setTimeout(() => {
            if (scheduledDateTime) {
              const formattedDate = scheduledDateTime.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })
              const formattedTime = scheduledDateTime.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              })
              addMessage('bot', `We will call you again on ${formattedDate} at ${formattedTime}.`)
            } else {
              showDateTimePicker()
            }
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'asking_better_time':
    case 'asking_after_cancel':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      setTimeout(() => {
        addMessage('bot', 'Hello, we received your product question. Would you like us to call you back to help?')
        setTimeout(() => {
          addMessage('user', 'No')
          setTimeout(() => {
            const options = ['Yes', 'No']
            addMessage('bot', 'Is there a better time that we can call you?', options)
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'unknown':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      setTimeout(() => {
        addMessage('bot', 'Hello, we received your product question. Would you like us to call you back to help?')
        setTimeout(() => {
          addMessage('user', 'Unknown message')
          setTimeout(() => {
            addMessage('bot', 'Unknown message received, transferring to messaging agent.')
          }, 500)
        }, 500)
      }, 500)
      break
      
    case 'ended':
      addMessage('bot', 'We received your product question! We are calling now to help.')
      setTimeout(() => {
        addMessage('bot', 'Have a nice day!')
      }, 500)
      break
  }
}

// Helper function to check if a workflow should have red active state
function isRedWorkflow(workflow: string): boolean {
  return workflow === 'offer' || 
         workflow === 'schedule consultation' || 
         workflow === 'customer satisfaction check-in'
}

// Show/hide phone, dataflow, and legal requirements box for Legal Requirements workflow
function updatePhoneAndDataflowVisibility() {
  const phoneContainer = document.querySelector('.phone-container') as HTMLElement
  const dataflowSection = document.querySelector('.white-box') as HTMLElement
  const legalRequirementsBox = document.getElementById('legalRequirementsBox') as HTMLElement
  const isLegalRequirements = selectedWorkflow === 'legal requirements'
  if (phoneContainer) {
    phoneContainer.style.display = isLegalRequirements ? 'none' : ''
  }
  if (dataflowSection) {
    dataflowSection.style.display = isLegalRequirements ? 'none' : ''
  }
  if (legalRequirementsBox) {
    legalRequirementsBox.style.display = isLegalRequirements ? 'flex' : 'none'
  }
}

// Handle workflow selection
function handleWorkflowSelect(workflow: string) {
  selectedWorkflow = workflow
  // Update active state of workflow buttons
  document.querySelectorAll('.workflow-btn').forEach(btn => {
    const btnWorkflow = (btn as HTMLElement).dataset.workflow
    if (btnWorkflow === workflow) {
      btn.classList.add('active')
      // Add red-active class for specific workflows
      if (isRedWorkflow(workflow)) {
        btn.classList.add('red-active')
      } else {
        btn.classList.remove('red-active')
      }
    } else {
      btn.classList.remove('active', 'red-active')
    }
  })
  // Reset version to A when workflow changes
  selectedVersion = 'A'
  updateVersionButtons()
  // Update dataflow diagram
  updateDataflow()
  // Hide phone and dataflow when Legal Requirements is selected
  updatePhoneAndDataflowVisibility()
  // Restart conversation for the new workflow
  resetConversation()
}

// Handle version selection
function handleVersionSelect(version: string) {
  // Only reset if version actually changed
  const versionChanged = selectedVersion !== version
  selectedVersion = version
  updateVersionButtons()
  
  // Reset dataflow when switching versions
  if (versionChanged) {
    resetConversation()
  } else {
    // Re-render options if there are any active options to show (only if version didn't change)
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.options && lastMessage.sender === 'bot') {
      renderOptions(lastMessage.options)
    }
  }
}

// Update version button active states
function updateVersionButtons() {
  document.querySelectorAll('.version-btn').forEach(btn => {
    const btnVersion = (btn as HTMLElement).dataset.version
    if (btnVersion === selectedVersion) {
      btn.classList.add('active')
      // Add red-active class for version B
      if (btnVersion === 'B') {
        btn.classList.add('red-active')
      } else {
        btn.classList.remove('red-active')
      }
    } else {
      btn.classList.remove('active', 'red-active')
    }
  })
}

function handleAIToggle() {
  aiEnabled = !aiEnabled
  updateAIToggleButton()
  // Restart conversation when toggling AI
  resetConversation()
}

function updateAIToggleButton() {
  const btn = document.getElementById('aiToggleBtn')
  if (btn) {
    btn.className = `ai-toggle-btn ${aiEnabled ? 'enabled' : 'disabled'}`
    btn.textContent = aiEnabled ? '✓' : '✕'
  }
}

// Initialize workflow button active states
function initializeWorkflowButtons() {
  document.querySelectorAll('.workflow-btn').forEach(btn => {
    const btnWorkflow = (btn as HTMLElement).dataset.workflow
    if (btnWorkflow === selectedWorkflow) {
      btn.classList.add('active')
      // Add red-active class for specific workflows
      if (isRedWorkflow(selectedWorkflow)) {
        btn.classList.add('red-active')
      } else {
        btn.classList.remove('red-active')
      }
    } else {
      btn.classList.remove('active', 'red-active')
    }
  })
}


// Tab switching functionality
function switchTab(tab: 'chat' | 'dialogue') {
  activeTab = tab
  
  // Update tab buttons
  document.getElementById('chatTab')?.classList.toggle('active', tab === 'chat')
  document.getElementById('dialogueTab')?.classList.toggle('active', tab === 'dialogue')
  
  // Update tab content visibility
  const chatView = document.getElementById('chatView')
  const dialogueView = document.getElementById('dialogueView')
  
  if (chatView) {
    chatView.classList.toggle('active', tab === 'chat')
  }
  if (dialogueView) {
    dialogueView.classList.toggle('active', tab === 'dialogue')
  }
  
  // Render dialogue editor if switching to dialogue tab
  if (tab === 'dialogue') {
    renderDialogueEditor()
  }
}

// Render dialogue editor with editable messages
function renderDialogueEditor() {
  const container = document.getElementById('dialogueEditorContainer')
  if (!container) return
  
  if (messages.length === 0) {
    container.innerHTML = `
      <div class="dialogue-empty-state">
        <p>No messages yet. Start a conversation to see the dialogue flow.</p>
      </div>
    `
    return
  }
  
  container.innerHTML = `
    <div class="dialogue-editor-header">
      <h3>Edit Dialogue Flow</h3>
      <p class="dialogue-subtitle">All messages in chronological order. Click on any message to edit it.</p>
    </div>
    <div class="dialogue-messages-list">
      ${messages.map((msg, index) => {
        const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const isBot = msg.sender === 'bot'
        const senderLabel = isBot ? 'Bot' : 'User'
        const messageNumber = index + 1
        
        return `
          <div class="dialogue-message-item dialogue-message-${isBot ? 'bot' : 'user'}" data-message-id="${msg.id}" data-message-index="${index}">
            <div class="dialogue-message-header">
              <span class="dialogue-message-number">#${messageNumber}</span>
              <span class="dialogue-sender-badge ${isBot ? 'bot' : 'user'}">${senderLabel}</span>
              <span class="dialogue-timestamp">${time}</span>
              ${!isBot && msg.options && msg.options.length > 0 ? `<span class="dialogue-options-badge">${msg.options.length} Option(s)</span>` : ''}
            </div>
            <div class="dialogue-message-content">
              ${isBot ? `
                <label>Message Text:</label>
                <textarea class="dialogue-text-input" data-field="text" rows="3">${msg.text || ''}</textarea>
              ` : `
                <div class="dialogue-options-editor">
                  <label>Message Text:</label>
                  <textarea class="dialogue-text-input" data-field="text" rows="2">${msg.text || ''}</textarea>
                  <label>Dialogue Options:</label>
                  <div class="dialogue-options-list" data-message-index="${index}">
                    ${msg.options && msg.options.length > 0 ? msg.options.map((option, optIndex) => `
                      <div class="dialogue-option-item">
                        <input type="text" class="dialogue-option-input" value="${option}" data-option-index="${optIndex}" placeholder="Enter option text">
                        <button class="dialogue-option-remove" data-option-index="${optIndex}" title="Remove option">×</button>
                      </div>
                    `).join('') : `
                      <div class="dialogue-no-options">No options available.</div>
                    `}
                  </div>
                </div>
              `}
            </div>
            <div class="dialogue-message-actions">
              <button class="dialogue-save-btn" data-message-id="${msg.id}">Save</button>
            </div>
          </div>
        `
      }).join('')}
    </div>
  `
  
  // Set up event listeners for dialogue editor
  setupDialogueEditorListeners()
  
  // Auto-scroll dialogue editor to bottom to show latest messages
  setTimeout(() => {
    const container = document.getElementById('dialogueEditorContainer')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, 100)
}

// Set up event listeners for dialogue editor
function setupDialogueEditorListeners() {
  // Save button handlers
  document.querySelectorAll('.dialogue-save-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const messageId = (e.target as HTMLElement).dataset.messageId
      if (messageId) {
        saveDialogueMessage(messageId)
      }
    })
  })
  
  // Delete button handlers removed - no longer allowing deleting messages
  
  // Add option button handlers removed - no longer allowing adding options
  
  // Remove option button handlers
  document.querySelectorAll('.dialogue-option-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const messageItem = (e.target as HTMLElement).closest('.dialogue-message-item')
      const messageId = messageItem?.getAttribute('data-message-id')
      const optionIndex = parseInt((e.target as HTMLElement).dataset.optionIndex || '0')
      if (messageId) {
        removeDialogueOption(messageId, optionIndex)
      }
    })
  })
}

// Save a dialogue message
function saveDialogueMessage(messageId: string) {
  const messageItem = document.querySelector(`[data-message-id="${messageId}"]`)
  if (!messageItem) return
  
  const message = messages.find(m => m.id === messageId)
  if (!message) return
  
  // Get text input
  const textInput = messageItem.querySelector('.dialogue-text-input[data-field="text"]') as HTMLTextAreaElement
  if (textInput) {
    message.text = textInput.value.trim()
  }
  
  // Get options - for user messages, get from the options list
  // For bot messages, we need to check if there's an options editor (which shouldn't exist for bot messages in the UI)
  // But we should preserve existing options on bot messages
  if (message.sender === 'user') {
    const optionsList = messageItem.querySelector('.dialogue-options-list')
    if (optionsList) {
      const optionInputs = optionsList.querySelectorAll('.dialogue-option-input') as NodeListOf<HTMLInputElement>
      const newOptions = Array.from(optionInputs).map(input => input.value.trim()).filter(opt => opt !== '')
      
      if (newOptions.length > 0) {
        message.options = newOptions
      } else {
        // If no options remain, remove the options property
        delete message.options
      }
    }
  } else {
    // For bot messages, preserve existing options (don't delete them)
    // Bot messages can have options (dialogue options for user selection)
    // We just don't allow editing them in the dialogue editor UI
  }
  
  // Re-render chat view to reflect changes
  renderMessages()
  
  // Show save confirmation
  const saveBtn = messageItem.querySelector('.dialogue-save-btn') as HTMLButtonElement
  if (saveBtn) {
    const originalText = saveBtn.textContent
    saveBtn.textContent = 'Saved!'
    saveBtn.style.background = 'var(--secondary-color)'
    setTimeout(() => {
      // Switch back to chat tab after saving
      switchTab('chat')
    }, 500)
  }
}

// Delete a dialogue message
function deleteDialogueMessage(messageId: string) {
  if (confirm('Are you sure you want to delete this message?')) {
    const index = messages.findIndex(m => m.id === messageId)
    if (index !== -1) {
      messages.splice(index, 1)
      renderMessages()
      
      // Re-render dialogue editor if it's active
      if (activeTab === 'dialogue') {
        renderDialogueEditor()
      }
    }
  }
}

// Add a new option to a message
function addDialogueOption(messageIndex: number) {
  const message = messages[messageIndex]
  if (!message) return
  
  // Only allow adding options to user messages
  if (message.sender !== 'user') return
  
  if (!message.options) {
    message.options = []
  }
  
  message.options.push('New Option')
  renderDialogueEditor()
}

// Remove an option from a message
function removeDialogueOption(messageId: string, optionIndex: number) {
  const message = messages.find(m => m.id === messageId)
  if (!message || !message.options) return
  
  // Only allow removing options from user messages
  if (message.sender !== 'user') return
  
  message.options.splice(optionIndex, 1)
  
  // If no options remain, remove the options property
  if (message.options.length === 0) {
    delete message.options
  }
  
  renderMessages()
  
  // Re-render dialogue editor if it's active
  if (activeTab === 'dialogue') {
    renderDialogueEditor()
  }
}
