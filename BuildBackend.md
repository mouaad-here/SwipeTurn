
## Objective

Three deliverables built in one pass:

1. **`SWIPTURN_BUILD_PLAN_V4.md`** — master plan updated with white theme, Clerk+Supabase stack, all new DB fields, visa logic, V1/V2 scope
2. **`SWIPTURN_FRONTEND_SCREENS.md`** — single file with a complete AI generation prompt for every screen (white/Dribbble design)
3. **`mobile/constants/theme.ts`** — white/light design system replacing the dark theme

---

## Deliverable 1 — Updated Design System (`mobile/constants/theme.ts`)

### Before (dark) → After (white/Dribbble)

```typescript
// BEFORE
colors = {
  bg:        '#0f0f0f',
  surface:   '#1c1c1e',
  text:      '#ffffff',
  textMuted: '#8e8e93',
  border:    'rgba(255,255,255,0.07)',
}

// AFTER — clean white, Dribbble-quality
export const colors = {
  bg:             '#FFFFFF',
  bgSoft:         '#F8F9FA',       // page background (very light grey)
  surface:        '#FFFFFF',       // card face
  surface2:       '#F3F4F6',       // input fill, muted chip bg
  border:         '#E5E7EB',       // subtle separator
  text:           '#111827',       // near-black headings
  textMuted:      '#6B7280',       // body copy
  textLight:      '#9CA3AF',       // placeholders, labels
  accentRed:      '#FF4422',       // primary brand
  accentRedSoft:  'rgba(255,68,34,0.08)',
  accentGreen:    '#00D48A',
  accentGreenSoft:'rgba(0,212,138,0.10)',
  shadow:         'rgba(17,24,39,0.08)',   // card shadow
  shadowStrong:   'rgba(17,24,39,0.16)',
};

export const fonts = {
  heading: 'Syne_800ExtraBold',
  body:    'DMSans_400Regular',
  medium:  'DMSans_500Medium',
};
```

### Global shadow style (added to theme.ts)

```typescript
export const cardShadow = {
  shadowColor:   '#111827',
  shadowOffset:  { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius:  16,
  elevation:     6,        // Android
};
```

---

## Deliverable 2 — `SWIPTURN_BUILD_PLAN_V4.md`

### What changes from V3

| Section | V3 | V4 |
|---|---|---|
| Design system | Dark `#0f0f0f` | White `#FFFFFF` + Dribbble-quality |
| Auth | Custom JWT | Clerk (React Native SDK) |
| Database host | PostgreSQL local | Supabase managed |
| Hosting | Railway (no longer free) | Render (750h/month free) |
| CV storage | `./uploads` folder | Supabase Storage, private bucket + signed URLs |
| Job sources | JSearch + 3 Scrapling | JSearch + Remotive + WWR + Adzuna + Greenhouse + Lever + 3 Scrapling (9 total) |
| Users table | 8 fields | 15 fields (+ target_locations, languages, linkedin_url, portfolio_url, work_authorization, desired_salary_min, metadata) |
| Jobs table | 15 fields | 17 fields (+ visa_sponsorship, open_to_intl) |
| Visa logic | Not present | Preference-aware: badges only shown when user targets remote/EU |
| Profile completion | Not present | Computed score in GET /users/me |
| V1/V2 scope | Not split | Clearly split |

### Full V4 DB schema additions to document

**users table — 7 new columns:**

```sql
target_locations    JSONB    DEFAULT '[]',
languages           JSONB    DEFAULT '[]',
linkedin_url        VARCHAR,
portfolio_url       VARCHAR,
work_authorization  VARCHAR  DEFAULT 'moroccan_no_visa',
desired_salary_min  INTEGER,
metadata            JSONB    DEFAULT '{}'
```

**jobs table — 2 new columns:**

```sql
visa_sponsorship  BOOLEAN  DEFAULT false,
open_to_intl      BOOLEAN  DEFAULT false
```

### Visa detection keyword lists to document

```python
OPEN_TO_INTL_KEYWORDS = [
    "open to international", "worldwide", "any nationality",
    "global candidates", "all nationalities", "international applicants",
    "moroccan", "morocco", "north africa", "afrique du nord",
    "mena", "maghreb", "maroc", "no visa required",
    "remote worldwide", "100% remote"
]

VISA_SPONSORSHIP_KEYWORDS = [
    "visa sponsorship", "sponsor work permit", "relocation package",
    "work permit provided", "visa provided", "tier 2 sponsor",
    "h-1b sponsor", "we sponsor", "relocation assistance"
]
```

### Feed visa filter logic to document

```python
# Only apply visa logic when user targets remote/EU jobs
INTL_PREF_TYPES = [
    "Full-time Remote Job", "Remote Internship",
    "Part-time", "Freelance", "Contract"
]

user_wants_intl = any(t in INTL_PREF_TYPES for t in prefs.get("types", []))

if user_wants_intl:
    for job in jobs:
        job["visa_badge"] = (
            "sponsored"     if job["visa_sponsorship"]  else
            "open_to_intl"  if job["open_to_intl"]      else
            "visa_required" if job["location"] not in ["Remote","Morocco"] else
            None
        )
```

### Profile completion score formula to document

```python
def compute_profile_score(user: dict) -> int:
    score = 0
    if user.get("cv_url"):              score += 30
    if len(user.get("extracted_skills", [])) >= 3:  score += 20
    if user.get("linkedin_url"):        score += 15
    if user.get("preferences"):         score += 15
    if user.get("target_locations"):    score += 10
    if user.get("languages"):           score += 10
    return score   # max 100
```

### V1 vs V2 scope table to include

| Feature | Scope |
|---|---|
| Auth (Clerk), DB (Supabase), hosting (Render) | V1 |
| All 9 job pipeline sources | V1 |
| CV upload + OpenRouter parsing | V1 |
| Basic matching (keyword scoring) | V1 |
| Swipe limit (10/day free) | V1 |
| target_locations, languages, work_authorization (DB columns) | V1 |
| Profile completion score | V1 |
| Onboarding Steps 2 & 3 (frontend only) | V2 |
| Editable skills section in Profile | V2 |
| Salary filter in feed | V2 |
| Auto-apply (cover letter + Playwright) | V2 |
| Push notifications | V2 |

---

## Deliverable 3 — `SWIPTURN_FRONTEND_SCREENS.md`

### File structure — one section per screen

```
# SwipTurn — Frontend Screen Generation Prompts
## Global Context Block (included in every prompt)
## Screen 1  — Welcome
## Screen 2A — Sign Up
## Screen 2B — Login
## Screen 3A — Preferences Step 1 (Job Type)
## Screen 3B — Preferences Step 2 (Field + Location)
## Screen 3C — Preferences Step 3 (Languages + Experience)
## Screen 4  — CV Upload
## Screen 5  — Swipe Feed
## Screen 6  — Job Detail Modal
## Screen 7  — Saved / My List
## Screen 8  — Profile
```

### Global Context Block (prepended to every prompt)

```
TECH STACK: React Native 0.81 + Expo SDK 54 + expo-router v6 + TypeScript
FONTS: Syne_800ExtraBold (headings), DMSans_400Regular (body), DMSans_500Medium (medium)
Fonts loaded in root _layout.tsx via useFonts — always available.

DESIGN SYSTEM (import from ../../constants/theme):
  bg:            #FFFFFF
  bgSoft:        #F8F9FA
  surface:       #FFFFFF
  surface2:      #F3F4F6
  border:        #E5E7EB
  text:          #111827
  textMuted:     #6B7280
  textLight:     #9CA3AF
  accentRed:     #FF4422
  accentRedSoft: rgba(255,68,34,0.08)
  accentGreen:   #00D48A
  accentGreenSoft: rgba(0,212,138,0.10)
  shadow: rgba(17,24,39,0.08)

CARD SHADOW STYLE:
  shadowColor: #111827, shadowOffset: {w:0,h:4},
  shadowOpacity: 0.08, shadowRadius: 16, elevation: 6

RULES:
- All backgrounds white or #F8F9FA — no dark colors
- Buttons: accentRed fill, 50px borderRadius, white text
- Cards: white background + cardShadow, 20px borderRadius
- Use SafeAreaView with bg=#FFFFFF or #F8F9FA
- No inline styles — StyleSheet.create only
- No any types
- No comments in code
```

### Screen prompts detail

---

#### Screen 1 — Welcome (`app/(auth)/welcome.tsx`)

```
Build the SwipTurn Welcome screen for React Native + Expo.

LAYOUT (top → bottom):
- StatusBar: dark-content
- Background: #F8F9FA full screen
- Top area (flex:1, justify:center, paddingHorizontal:32):
    • Decorative element: a circle View (width:260 height:260 borderRadius:130)
      positioned absolute, top:-40, right:-60,
      backgroundColor: rgba(255,68,34,0.06)
    • A smaller circle (width:140 height:140 borderRadius:70)
      absolute, top:60, left:-30, backgroundColor:rgba(255,68,34,0.04)
    • Logo row (flexDirection:row, alignItems:baseline):
        "Swipt" — fontFamily:Syne_800ExtraBold, fontSize:54, color:#111827
        "turn"  — fontFamily:Syne_800ExtraBold, fontSize:54, color:#FF4422
    • Tagline below: "Swipe. Turn your career around."
        fontFamily:DMSans_400Regular, fontSize:16, color:#6B7280, marginTop:12
    • Below tagline — a preview card (marginTop:40):
        White card, borderRadius:20, padding:20, shadow applied
        Shows: small company logo placeholder (48x48 rounded grey box)
        + "Senior Product Designer" in Syne_800ExtraBold 18px #111827
        + "Innovate Tech · Remote" in DMSans 13px #6B7280
        + orange match bar (4px height, 87% fill, accentRed)
        + "87% match" text in accentRed 12px DMSans_500Medium
        Card is slightly rotated: transform: [{rotate: '-2deg'}]

- Bottom area (paddingHorizontal:24, paddingBottom:48, gap:16):
    • "Get Started" button:
        bg:accentRed, borderRadius:50, paddingVertical:18,
        text: "Get Started" DMSans_500Medium 17px white
    • "Already have an account? Log in" row centered:
        "Already have an account? " — DMSans 14px #6B7280
        "Log in" — DMSans_500Medium 14px accentRed

NAVIGATION:
  Get Started → router.push('/(auth)/signup')
  Log in → router.push('/(auth)/login')
```

---

#### Screen 2A — Sign Up (`app/(auth)/signup.tsx`)

```
Build the SwipTurn Create Account screen.

LAYOUT:
- Background: #FFFFFF, paddingTop:60, paddingHorizontal:24
- Back arrow (←) top left, color:#111827, fontSize:24, onPress:router.back()
- "Create Account" heading — Syne_800ExtraBold 30px #111827, marginTop:28, marginBottom:36
- Form (flex:1, gap:0):
    Label "Email" — DMSans_500Medium 13px #6B7280, marginBottom:8
    TextInput:
      backgroundColor:#F3F4F6, borderRadius:16,
      padding:18, color:#111827, fontSize:15, DMSans
      placeholder:"Enter your email" placeholderTextColor:#9CA3AF
    Label "Password" marginTop:20
    TextInput row (password + eye toggle):
      same style, secureTextEntry, eye icon button right side
    Error text (accentRed, 13px) if validation fails
    "Continue" button: accentRed fill, borderRadius:50, paddingVertical:18, marginTop:28
      shows ActivityIndicator while loading
    Divider row: line — "OR" — line (color:#E5E7EB, text #9CA3AF)
    "Continue with Google" button:
      borderWidth:1, borderColor:#E5E7EB, borderRadius:50, paddingVertical:16
      white background, "G" icon + text DMSans_500Medium 15px #111827
- Bottom: Terms text centered, 12px #9CA3AF, "Terms of Service" + "Privacy Policy" underlined #111827

STATE: email, password, showPass, loading, error
ON SUBMIT: call api.register(email,password) → success → router.replace('/(onboarding)/preferences')
```

---

#### Screen 2B — Login (`app/(auth)/login.tsx`)

```
Same structure as Sign Up but:
- Heading: "Welcome back" Syne_800ExtraBold 30px
- Button text: "Log in"
- No Google button, no Terms text
- Bottom: "Don't have an account? Sign up" row
ON SUBMIT: call api.login(email,password) → success → router.replace('/(tabs)/swipe')
```

---

#### Screen 3A — Preferences Step 1 (`app/(onboarding)/preferences.tsx`)

```
Build SwipTurn Preferences Step 1 of 3.

LAYOUT:
- Background: #FFFFFF
- Header row (paddingTop:60, paddingHorizontal:24):
    Back arrow (←) left
    Step dots center: 3 dots (8x8 circles), active=accentRed, inactive=#E5E7EB
- ScrollView content (paddingHorizontal:24):
    Heading: "What are you\n" white line + "looking for?" accentRed line
      Syne_800ExtraBold 34px, lineHeight:42
    Subtitle: "Select your preferences to personalize your Swipturn feed."
      DMSans 15px #6B7280, marginBottom:32
    Chip grid (flexDirection:row, flexWrap:wrap, gap:10):
      Options: "Full-time Remote Job","Remote Internship","Part-time",
               "Freelance","Contract","Side Projects","Paid Mentorship"
      Unselected chip: borderWidth:1, borderColor:#E5E7EB, bg:#FFFFFF, text:#111827
      Selected chip:   bg:accentRed, border:accentRed, text:#FFFFFF
        + checkmark "✓ " prefix in selected chips
      All chips: borderRadius:50, paddingVertical:12, paddingHorizontal:18
                 DMSans_500Medium 14px

- Bottom (paddingHorizontal:24, paddingBottom:40):
    "Next Step →" button: accentRed, borderRadius:50, paddingVertical:18
      disabled+opacity:0.35 when nothing selected
    "STEP 1 OF 3" label: DMSans 12px #9CA3AF, textAlign:center, letterSpacing:1.2
```

---

#### Screen 3B — Preferences Step 2 (`app/(onboarding)/preferences-2.tsx`)

```
Build SwipTurn Preferences Step 2 of 3.

Same header/footer structure as Step 1 but dot 2 is active.

CONTENT:
Section 1 — "What's your field?"
  Chips: "CS / Engineering","AI / ML","Design","Data Science",
         "DevOps","Mobile","Product","Cybersecurity"

Section 2 — "Where do you want to work?" (marginTop:28)
  Chips: "Remote Only","Morocco","France","Germany",
         "Netherlands","UK","UAE","Anywhere"

Both chip sections follow same selected/unselected style as Step 1.
Multiple selection allowed on both.

ON NEXT: router.push('/(onboarding)/preferences-3')
```

---

#### Screen 3C — Preferences Step 3 (`app/(onboarding)/preferences-3.tsx`)

```
Build SwipTurn Preferences Step 3 of 3. Dot 3 active.

CONTENT:

Section 1 — "What's your experience level?"
  Single-select row of 3 large chips:
    "Student · 0 yr" | "Junior · 1-2 yr" | "Mid · 3-5 yr"
  Selected: accentRed fill. Unselected: border #E5E7EB.
  Each chip: flex:1, paddingVertical:18, borderRadius:16, centered text

Section 2 — "Languages you speak" (marginTop:28)
  Multi-select chips:
    "English","French","Arabic","Spanish","German","Dutch"
  Same chip style as Step 1.

Section 3 — "Work authorization" (marginTop:28, only shown if user picked EU/UK location)
  Single-select chips:
    "No visa needed (Remote)","Moroccan — need visa","EU Resident","EU Citizen"

Bottom button: "Finish Setup →" → router.replace('/(onboarding)/cv-upload')
```

---

#### Screen 4 — CV Upload (`app/(onboarding)/cv-upload.tsx`)

```
Build SwipTurn CV Upload screen.

LAYOUT:
- Background: #FFFFFF
- Header row (paddingTop:60): back arrow left, "Upload your CV" Syne_800ExtraBold 20px center
- Content (paddingHorizontal:24):
    Upload zone (TouchableOpacity):
      borderWidth:1.5, borderStyle:'dashed', borderColor:rgba(255,68,34,0.4)
      borderRadius:20, paddingVertical:44, alignItems:center, gap:12
      bg: #FFF8F7 (very faint orange tint)
      
      IDLE state:
        Icon circle: width:72 height:72 borderRadius:36
          bg:rgba(255,68,34,0.10), centered "↑" text accentRed fontSize:28
        "Tap to upload your CV" Syne_800ExtraBold 18px #111827
        "PDF or DOCX supported (Max 5MB)" DMSans 13px #6B7280
        "Select File" button: bg:#111827, borderRadius:50, px:32, py:12
          text:white DMSans_500Medium 14px
          
      LOADING state (after pick):
        ActivityIndicator accentRed large
        "Reading your CV..." Syne_800ExtraBold 18px #111827
        filename in #6B7280

    After parse success:
      Progress bar: height:3, bg:accentGreen, borderRadius:2, marginVertical:20
      "Skills we found  ✓" — DMSans_500Medium 16px accentGreen
      Skill chips (flexWrap:wrap, gap:8):
        bg:accentGreenSoft, border:accentGreen, text:accentGreen
        borderRadius:50, padding:10px 16px, "skill × "
      "+ Add more" chip: dashed border, #9CA3AF text

- Footer (shown after parse): "Looks good, continue →" accentRed full-width button
```

---

#### Screen 5 — Swipe Feed (`app/(tabs)/swipe.tsx`)

```
Build SwipTurn Swipe Feed screen.

LAYOUT:
- Background: #F8F9FA (soft white-grey)
- Header (paddingTop:60, paddingHorizontal:20):
    Left: orange circle (40x40) with "⟷" icon + "Swipturn" Syne_800ExtraBold 20px #111827
    Right: notification bell button — white circle card (40x40) with shadow, 🔔 icon
           red dot indicator (8x8 accentRed) absolute top-right

- Card stack (flex:1, margin:16):
    Background cards (stacked behind, slightly offset):
      cards[currentIndex+1]: top:10, left:8, right:8, opacity:0.5, borderRadius:24
      cards[currentIndex+2]: top:18, left:14, right:14, opacity:0.3, borderRadius:24

    Active card (WHITE card, borderRadius:24, cardShadow, padding:20):
      TOP SECTION:
        Row: company logo (56x56, borderRadius:14, bg:#F3F4F6 + initial letter)
           + company name (DMSans_500Medium 15px #111827)
           + location (📍 DMSans 12px #6B7280)
           + REMOTE badge (if remote): bg:rgba(0,212,138,0.10), border:accentGreen
             text:accentGreen DMSans_500Medium 11px letterSpacing:0.5 pill shape
        Job title: Syne_800ExtraBold 28px #111827, lineHeight:34, marginTop:16
        Skill chips row (flexWrap:wrap, gap:8, marginTop:12):
          Matched skill: bg:accentGreenSoft, border:accentGreen, text:accentGreen "✓ skill"
          Unmatched skill: bg:#F3F4F6, no border, text:#6B7280 "● skill"
          borderRadius:50, paddingVertical:7, paddingHorizontal:12, DMSans_500Medium 13px
        Description: DMSans 14px #6B7280, lineHeight:22, numberOfLines:4, marginTop:16

      BOTTOM SECTION (marginTop:auto):
        Row: "CV Match " + "87%" in accentRed (DMSans_500Medium 13px)
             + "RECOMMENDED FOR YOU" right-aligned (DMSans 10px #9CA3AF letterSpacing:0.5)
        Match track (height:4, bg:#F3F4F6, borderRadius:2, marginTop:8):
          Fill width = match_score%, bg:accentRed, borderRadius:2

- Action buttons row (justifyContent:center, gap:32, paddingBottom:16):
    Skip (X): width:62 height:62 borderRadius:31
      bg:#F3F4F6, border: none, "✕" #6B7280 fontSize:22
    Like (♥): width:72 height:72 borderRadius:36
      bg:accentRed, "♥" white fontSize:26
    Both have cardShadow applied
```

---

#### Screen 6 — Job Detail Modal (`app/job-detail.tsx`)

```
Build SwipTurn Job Detail bottom sheet modal (presentation:'modal').

LAYOUT:
- Background: #FFFFFF, borderTopLeftRadius:28, borderTopRightRadius:28
- Drag handle: width:40 height:4 borderRadius:2 bg:#E5E7EB, centered, marginTop:12
- ScrollView (paddingHorizontal:24, paddingTop:16):

    Company row (gap:14, marginBottom:20):
      Logo box (56x56, borderRadius:14, bg:#F3F4F6, company initial letter)
      Info: company name DMSans_500Medium 16px #111827
            location row: "📍 City" + REMOTE pill (accentGreen)
      Share button: white circle 40x40 borderRadius:20 border #E5E7EB "⇧"

    Job title: Syne_800ExtraBold 30px #111827, lineHeight:36
    Salary: "$140k – $180k" DMSans_500Medium 20px accentRed, marginBottom:20

    Info pills row (gap:10, marginBottom:28):
      3 pills (TYPE / EXP. / LEVEL):
        bg:#F3F4F6, borderRadius:14, padding:12, flex:1, centered
        Label: DMSans 10px #9CA3AF letterSpacing:1, marginBottom:4
        Value: DMSans_500Medium 13px #111827

    "About the role" section:
      Title row: accentRed bar (3x18) + "About the role" DMSans_500Medium 16px #111827
      Description: DMSans 14px #6B7280, lineHeight:24

    "Required Skills" section (same title row style):
      Chips: borderWidth:1 borderColor:#E5E7EB, borderRadius:50,
             paddingVertical:8, paddingHorizontal:14
             DMSans_500Medium 13px #111827

    Spacer height:110 (for footer)

- Fixed footer (position:absolute bottom:0, bg:#FFFFFF, borderTop #E5E7EB, padBottom:32):
    Left: circular match ring (56x56, borderRadius:28, border:2 accentRed)
      "87%" Syne_800ExtraBold 14px accentRed + "MATCH" DMSans 9px #6B7280
    Right: "Apply Now →" accentRed pill button (flex:1, paddingVertical:16)
```

---

#### Screen 7 — Saved / My List (`app/(tabs)/saved.tsx`)

```
Build SwipTurn Saved screen.

LAYOUT:
- Background: #F8F9FA
- Header (paddingTop:64, paddingHorizontal:24):
    "My List" Syne_800ExtraBold 32px #111827

- Tabs row (paddingHorizontal:24, marginBottom:16):
    "Saved" | "Applied" — each tab flex:1, centered
    Active: DMSans_500Medium 15px accentRed + 2px accentRed underline
    Inactive: DMSans_500Medium 15px #6B7280
    Full-width 1px #E5E7EB bottom border under both tabs

- FlatList (contentContainerStyle: paddingHorizontal:16, gap:12):
    Each job row (WHITE card, borderRadius:16, padding:16, cardShadow):
      Left: company logo box (56x56, borderRadius:12, bg:#F3F4F6)
      Center (flex:1, gap:3):
        Title: DMSans_500Medium 15px #111827, numberOfLines:1
        Company: DMSans 13px #6B7280
        Meta row: "📍 LOCATION" + "🕐 2D AGO" — DMSans 11px #9CA3AF
      Right badge pill:
        Saved:   bg:rgba(255,68,34,0.10), text:accentRed "SAVED"
        Applied: bg:rgba(0,212,138,0.10), text:accentGreen "APPLIED"
        borderRadius:50, padding:5px 10px, DMSans_500Medium 11px

    Tap any row → router.push({ pathname:'/job-detail', params:{id} })
```

---

#### Screen 8 — Profile (`app/(tabs)/profile.tsx`)

```
Build SwipTurn Profile screen.

LAYOUT:
- Background: #F8F9FA, ScrollView
- Avatar section (paddingTop:64, alignItems:center, paddingBottom:24):
    Orange circle avatar (88x88, borderRadius:44, bg:accentRed)
      initials: Syne_800ExtraBold 32px white
    Name: Syne_800ExtraBold 24px #111827, marginTop:14
    University: DMSans 12px #9CA3AF letterSpacing:1.2, marginTop:4

    Profile completion bar (marginTop:16, width:200):
      Label: "Profile 72% complete" DMSans_500Medium 12px #6B7280, marginBottom:6
      Track: height:6, bg:#E5E7EB, borderRadius:3
      Fill: width=score%, bg:accentRed, borderRadius:3

- "MY RESUME" section (paddingHorizontal:24, marginBottom:24):
    Label: DMSans 11px #9CA3AF letterSpacing:1.4, marginBottom:10
    White card (borderRadius:16, padding:16, cardShadow, flexDirection:row, gap:12):
      Icon box (40x40, borderRadius:10, bg:rgba(255,68,34,0.10)): 📄 emoji
      Info (flex:1): filename DMSans_500Medium 14px #111827
                     "UPDATED 2 DAYS AGO" DMSans 11px #9CA3AF
      "Update CV" button: accentRed pill, px:14 py:8, DMSans_500Medium 12px white

- "MY PREFERENCES" section:
    Label + White card (borderRadius:16, padding:16, cardShadow):
      Chips (flexWrap:wrap, gap:8):
        Each: border #E5E7EB, borderRadius:50, px:14 py:8,
              DMSans_500Medium 13px #111827
      "+" add button: accentRed border circle (36x36)

- "ACCOUNT SETTINGS" section:
    Label + White card (borderRadius:16, cardShadow):
      Each setting row (paddingVertical:16, paddingHorizontal:16,
                        borderBottom:#E5E7EB, flexDirection:row, gap:14):
        Icon (18px emoji, width:28 centered)
        Label (flex:1, DMSans_500Medium 15px #111827)
        Right value + "›" DMSans 20px #9CA3AF
      "Log out" row: icon+label in accentRed, onPress:logout→router.replace('/(auth)/welcome')
```

---

## Verification / DoD

| Step | Target file | Done when |
|---|---|---|
| 1 | `mobile/constants/theme.ts` | All dark values replaced with white system |
| 2 | `SWIPTURN_BUILD_PLAN_V4.md` | Created, contains updated stack + full DB schema (17+15 cols) + visa logic + V1/V2 table |
| 3 | `SWIPTURN_FRONTEND_SCREENS.md` | Created with Global Context Block + 11 screen prompts (Welcome → Profile) |
| 4 | `step-logs/step-2/STEP_2_LOG.md` | Documents all files created, tokens changed, design decisions |
