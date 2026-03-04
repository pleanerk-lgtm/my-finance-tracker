import { useState, useMemo, useRef, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── localStorage helpers ─────────────────────────────────────────────────────
const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

// ─── ZAR Formatter ────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(n || 0);

const CATEGORIES = [
  { name: "Housing", color: "#1a1a1a", icon: "🏠" },
  { name: "Food", color: "#3d3d3d", icon: "🍽️" },
  { name: "Transport", color: "#5c5c5c", icon: "🚗" },
  { name: "Health", color: "#7a7a7a", icon: "💊" },
  { name: "Shopping", color: "#999", icon: "🛍️" },
  { name: "Entertainment", color: "#b8b8b8", icon: "🎬" },
  { name: "Utilities", color: "#d6d6d6", icon: "⚡" },
  { name: "Other", color: "#c8c8c8", icon: "📦" },
];

const CATEGORY_RULES = [
  { keywords: ["rent","mortgage","bond","hoa","levy","sectional"], category: "Housing" },
  { keywords: ["woolworths food","checkers","pick n pay","spar","dis-chem food","shoprite","food","restaurant","cafe","coffee","pizza","sushi","uber eats","mr d","takealot food"], category: "Food" },
  { keywords: ["fuel","petrol","engen","sasol","bp","caltex","total","uber","bolt","taxi","toll","e-toll","vehicle"], category: "Transport" },
  { keywords: ["dis-chem","clicks","pharmacy","doctor","hospital","dentist","optometrist","medical aid","discovery health","bonitas","momentum health","gym","virgin active","planet fitness"], category: "Health" },
  { keywords: ["woolworths","mr price","edgars","truworths","foschini","h&m","zara","amazon","takealot","makro","game","builders"], category: "Shopping" },
  { keywords: ["netflix","showmax","dstv","spotify","apple","youtube","movie","nu metro","ster kinekor","ticket","steam"], category: "Entertainment" },
  { keywords: ["eskom","city power","water","rates","telkom","mtn","vodacom","cell c","rain","fibre","insurance","outsurance","santam","old mutual","sanlam"], category: "Utilities" },
];

const guessCategory = (desc) => {
  const lower = (desc || "").toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return rule.category;
  }
  return "Other";
};

const ASSET_TYPES = ["Primary Residence","Investment Property","Vehicle","Additional Vehicle","Savings / Cash","Unit Trusts / Investments","Retirement Annuity","Other Asset"];
const LIABILITY_TYPES = ["Home Loan","Vehicle Finance","Personal Loan","Credit Card","Overdraft","Store Account","Student Loan","Other Debt"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const INIT_ACCOUNTS = [
  { id: 1, name: "FNB Cheque Account", balance: 24820.5, color: "#1a1a1a", type: "Cheque" },
  { id: 2, name: "Absa Savings", balance: 87340.0, color: "#555", type: "Savings" },
  { id: 3, name: "Nedbank Credit Card", balance: -8250.75, color: "#888", type: "Credit" },
];

const INIT_EXPENSES = [
  { id: 1, desc: "Woolworths Food", amount: 3200, category: "Food", date: "2026-03-01", account: 1, isIncome: false },
  { id: 2, desc: "Bond Payment ABSA", amount: 14500, category: "Housing", date: "2026-03-01", account: 1, isIncome: false },
  { id: 3, desc: "Bolt Ride", amount: 280, category: "Transport", date: "2026-03-02", account: 3, isIncome: false },
  { id: 4, desc: "DStv Premium", amount: 959, category: "Entertainment", date: "2026-03-02", account: 3, isIncome: false },
  { id: 5, desc: "Dis-Chem", amount: 890, category: "Health", date: "2026-03-03", account: 1, isIncome: false },
  { id: 6, desc: "Pick n Pay", amount: 2100, category: "Food", date: "2026-03-03", account: 1, isIncome: false },
  { id: 7, desc: "Eskom Municipal", amount: 1850, category: "Utilities", date: "2026-02-28", account: 2, isIncome: false },
  { id: 8, desc: "Takealot", amount: 2340, category: "Shopping", date: "2026-02-27", account: 3, isIncome: false },
  { id: 9, desc: "Virgin Active", amount: 699, category: "Health", date: "2026-02-26", account: 1, isIncome: false },
  { id: 10, desc: "Netflix", amount: 199, category: "Entertainment", date: "2026-02-25", account: 3, isIncome: false },
  { id: 11, desc: "Salary Credit", amount: 52000, category: "Income", date: "2026-03-25", account: 1, isIncome: true },
  { id: 12, desc: "Salary Credit", amount: 52000, category: "Income", date: "2026-02-25", account: 1, isIncome: true },
  { id: 13, desc: "Salary Credit", amount: 52000, category: "Income", date: "2026-01-25", account: 1, isIncome: true },
];

// ─── CSV Parser ───────────────────────────────────────────────────────────────
const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = []; let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return Object.fromEntries(headers.map((h,i) => [h, (cols[i]||"").replace(/"/g,"").trim()]));
  });
};
const findCol = (row, cands) => { for (const c of cands) { const k = Object.keys(row).find(k => k.includes(c)); if (k && row[k]) return row[k]; } return null; };
const normDate = (raw) => {
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  return raw;
};
const csvToTx = (text, accountId) => {
  const rows = parseCSV(text); const results = [];
  for (const row of rows) {
    const desc = findCol(row, ["description","narrative","merchant","name","memo","payee"]) || "Unknown";
    const date = normDate(findCol(row, ["date","posted","transaction date","trans date"]) || "");
    if (!date) continue;
    let amount = 0, isIncome = false;
    const credit = findCol(row, ["credit","deposit","incoming"]);
    const debit = findCol(row, ["debit","withdrawal","outgoing"]);
    if (credit && parseFloat(credit) > 0) { amount = parseFloat(credit); isIncome = true; }
    else if (debit && parseFloat(debit) > 0) { amount = parseFloat(debit); }
    else {
      const raw = findCol(row, ["amount","transaction amount"]) || "";
      const n = parseFloat(raw.replace(/[^0-9.\-]/g,""));
      if (!isNaN(n) && n !== 0) { amount = Math.abs(n); isIncome = n < 0; }
    }
    if (!amount || amount <= 0) continue;
    results.push({ id: Date.now()+Math.random(), desc: desc.slice(0,60), amount: Math.round(amount*100)/100, date, category: isIncome ? "Income" : guessCategory(desc), account: accountId, isIncome });
  }
  return results;
};

// ─── Finance Calc ─────────────────────────────────────────────────────────────
const calcInstalment = (principal, annualRate, months) => {
  if (!principal || !months) return 0;
  if (!annualRate) return principal / months;
  const r = annualRate / 100 / 12;
  return principal * r / (1 - Math.pow(1 + r, -months));
};

// ─── Shared Styles ────────────────────────────────────────────────────────────
const inp = { width:"100%", padding:"10px 12px", border:"1px solid #e5e5e5", borderRadius:10, fontSize:13, outline:"none", background:"#fafafa", boxSizing:"border-box", fontFamily:"inherit" };
const btnD = { background:"#1a1a1a", color:"#fff", border:"none", borderRadius:10, padding:"11px 20px", fontSize:14, fontWeight:600, cursor:"pointer", width:"100%", fontFamily:"inherit" };
const btnL = { background:"#f5f5f5", color:"#555", border:"none", borderRadius:10, padding:"11px 20px", fontSize:14, fontWeight:600, cursor:"pointer", width:"100%", fontFamily:"inherit" };
const lbl = { fontSize:11, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:5 };

function Sheet({ onClose, children }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:"28px 24px 44px",width:"100%",boxSizing:"border-box",maxHeight:"92vh",overflowY:"auto"}}>{children}</div>
    </div>
  );
}

// ─── Payslip Income Input ─────────────────────────────────────────────────────
function PayslipRow({ item, onChange, onRemove }) {
  const ctc = parseFloat(item.ctc) || 0;
  const tax = parseFloat(item.tax) || 0;
  const uif = parseFloat(item.uif) || 0;
  const pension = parseFloat(item.pension) || 0;
  const medical = parseFloat(item.medical) || 0;
  const otherDed = parseFloat(item.otherDed) || 0;
  const totalDed = tax + uif + pension + medical + otherDed;
  const nett = ctc - totalDed;

  return (
    <div style={{background:"#f8f8f6",borderRadius:14,padding:16,marginBottom:12,border:"1px solid #eee"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>{item.type}</span>
        <button onClick={onRemove} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
      <div style={{marginBottom:10}}>
        <label style={lbl}>Employer / Source</label>
        <input style={inp} placeholder="e.g. Acme (Pty) Ltd" value={item.source} onChange={e=>onChange({...item,source:e.target.value})}/>
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:12,marginBottom:8,border:"1px solid #e8e8e8"}}>
        <p style={{margin:"0 0 8px",fontSize:11,fontWeight:700,color:"#27ae60",textTransform:"uppercase",letterSpacing:"0.08em"}}>Gross / Cost to Company</p>
        <label style={lbl}>Monthly CTC / Gross Salary</label>
        <input style={inp} type="number" placeholder="R 0.00" value={item.ctc} onChange={e=>onChange({...item,ctc:e.target.value})}/>
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:12,marginBottom:8,border:"1px solid #e8e8e8"}}>
        <p style={{margin:"0 0 10px",fontSize:11,fontWeight:700,color:"#e74c3c",textTransform:"uppercase",letterSpacing:"0.08em"}}>Deductions</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["PAYE / Tax","tax"],["UIF","uif"],["Pension / Provident Fund","pension"],["Medical Aid","medical"],["Other Deductions","otherDed"]].map(([label,key])=>(
            <div key={key}>
              <label style={lbl}>{label}</label>
              <input style={inp} type="number" placeholder="R 0.00" value={item[key]||""} onChange={e=>onChange({...item,[key]:e.target.value})}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:"#1a1a1a",borderRadius:10,padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
        <div><p style={{margin:"0 0 2px",fontSize:10,color:"#888",textTransform:"uppercase"}}>Gross</p><p style={{margin:0,fontSize:13,fontWeight:600,color:"#fff",fontFamily:"monospace"}}>{fmt(ctc)}</p></div>
        <div><p style={{margin:"0 0 2px",fontSize:10,color:"#888",textTransform:"uppercase"}}>Deductions</p><p style={{margin:0,fontSize:13,fontWeight:600,color:"#e74c3c",fontFamily:"monospace"}}>−{fmt(totalDed)}</p></div>
        <div><p style={{margin:"0 0 2px",fontSize:10,color:"#aaa",textTransform:"uppercase"}}>Nett Received</p><p style={{margin:0,fontSize:14,fontWeight:700,color:"#27ae60",fontFamily:"monospace"}}>{fmt(nett)}</p></div>
      </div>
    </div>
  );
}

// ─── Asset Row with optional financing ───────────────────────────────────────
function AssetRow({ item, onChange, onRemove }) {
  const financed = item.financed;
  const principal = parseFloat(item.finPrincipal) || 0;
  const rate = parseFloat(item.finRate) || 0;
  const termMonths = parseInt(item.finTerm) || 0;
  const tenorLeft = parseInt(item.finTenorLeft) || 0;
  const balloon = parseFloat(item.finBalloon) || 0;
  const deposit = parseFloat(item.finDeposit) || 0;
  const calcedInstalment = calcInstalment(principal - deposit, rate, termMonths);
  const actualBalance = tenorLeft > 0 ? calcInstalment(principal - deposit, rate, termMonths) * tenorLeft + balloon : 0;

  return (
    <div style={{background:"#f8f8f6",borderRadius:14,padding:16,marginBottom:12,border:"1px solid #eee"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>{item.type}</span>
        <button onClick={onRemove} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div><label style={lbl}>Description</label><input style={inp} placeholder="e.g. 2022 Toyota Hilux" value={item.desc} onChange={e=>onChange({...item,desc:e.target.value})}/></div>
        <div><label style={lbl}>Estimated Value (R)</label><input style={inp} type="number" placeholder="R 0" value={item.value} onChange={e=>onChange({...item,value:e.target.value})}/></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#fff",borderRadius:10,border:"1px solid #e8e8e8",marginBottom:financed?12:0}}>
        <div onClick={()=>onChange({...item,financed:!financed})} style={{width:36,height:20,borderRadius:99,background:financed?"#1a1a1a":"#ddd",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
          <div style={{position:"absolute",top:3,left:financed?18:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
        </div>
        <span style={{fontSize:13,fontWeight:500,color:"#555"}}>This asset is financed / on credit</span>
      </div>
      {financed && (
        <div style={{background:"#fff",borderRadius:10,padding:14,border:"1px solid #e8e8e8"}}>
          <p style={{margin:"0 0 12px",fontSize:11,fontWeight:700,color:"#3498db",textTransform:"uppercase",letterSpacing:"0.08em"}}>Financing Terms</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div style={{gridColumn:"1/-1"}}><label style={lbl}>Financier / Institution</label><input style={inp} placeholder="e.g. WesBank, ABSA Vehicle Finance" value={item.finInstitution||""} onChange={e=>onChange({...item,finInstitution:e.target.value})}/></div>
            <div><label style={lbl}>Original Loan Amount (R)</label><input style={inp} type="number" placeholder="R 0" value={item.finPrincipal||""} onChange={e=>onChange({...item,finPrincipal:e.target.value})}/></div>
            <div><label style={lbl}>Deposit Paid (R)</label><input style={inp} type="number" placeholder="R 0" value={item.finDeposit||""} onChange={e=>onChange({...item,finDeposit:e.target.value})}/></div>
            <div><label style={lbl}>Interest Rate (% p.a.)</label><input style={inp} type="number" placeholder="e.g. 11.25" value={item.finRate||""} onChange={e=>onChange({...item,finRate:e.target.value})}/></div>
            <div><label style={lbl}>Total Term (months)</label><input style={inp} type="number" placeholder="e.g. 72" value={item.finTerm||""} onChange={e=>onChange({...item,finTerm:e.target.value})}/></div>
            <div><label style={lbl}>Months Remaining</label><input style={inp} type="number" placeholder="e.g. 48" value={item.finTenorLeft||""} onChange={e=>onChange({...item,finTenorLeft:e.target.value})}/></div>
            <div><label style={lbl}>Balloon / Residual (R)</label><input style={inp} type="number" placeholder="R 0" value={item.finBalloon||""} onChange={e=>onChange({...item,finBalloon:e.target.value})}/></div>
            <div><label style={lbl}>Actual Monthly Payment (R)</label><input style={inp} type="number" placeholder="R 0" value={item.finActualPayment||""} onChange={e=>onChange({...item,finActualPayment:e.target.value})}/></div>
          </div>
          {principal > 0 && termMonths > 0 && (
            <div style={{background:"#1a1a1a",borderRadius:10,padding:"12px 14px",marginTop:8}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px"}}>
                {[["Calculated Instalment",fmt(calcedInstalment),"#fff"],["Actual Payment",item.finActualPayment?fmt(parseFloat(item.finActualPayment)):"—","#fff"],["Est. Balance Outstanding",fmt(actualBalance),"#f39c12"],["Balloon / Residual",fmt(balloon),"#f39c12"]].map(([k,v,c])=>(
                  <div key={k}><p style={{margin:"0 0 2px",fontSize:10,color:"#888",textTransform:"uppercase"}}>{k}</p><p style={{margin:0,fontSize:13,fontWeight:600,color:c,fontFamily:"monospace"}}>{v}</p></div>
                ))}
              </div>
              {item.finActualPayment && Math.abs(parseFloat(item.finActualPayment) - calcedInstalment) > 50 && (
                <p style={{margin:"10px 0 0",fontSize:12,color:"#f39c12",fontWeight:500}}>⚠️ Payment differs from calculated instalment by {fmt(Math.abs(parseFloat(item.finActualPayment) - calcedInstalment))} — verify with statement</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiabilityRow({ item, onChange, onRemove }) {
  return (
    <div style={{background:"#f8f8f6",borderRadius:14,padding:16,marginBottom:12,border:"1px solid #eee"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:700,color:"#1a1a1a"}}>{item.type}</span>
        <button onClick={onRemove} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <div><label style={lbl}>Description</label><input style={inp} placeholder="e.g. Home Loan" value={item.desc||""} onChange={e=>onChange({...item,desc:e.target.value})}/></div>
        <div><label style={lbl}>Balance Owed (R)</label><input style={inp} type="number" placeholder="R 0" value={item.balance||""} onChange={e=>onChange({...item,balance:e.target.value})}/></div>
        <div><label style={lbl}>Monthly Payment (R)</label><input style={inp} type="number" placeholder="R 0" value={item.payment||""} onChange={e=>onChange({...item,payment:e.target.value})}/></div>
      </div>
    </div>
  );
}

// ─── Credit Report Wizard ─────────────────────────────────────────────────────
function CreditReport({ accounts, expenses, onClose }) {
  const [step, setStep] = useState(0);
  const [period, setPeriod] = useState({ start:"2025-12-01", end:"2026-02-28" });
  const [personal, setPersonal] = useState({ name:"", idNumber:"", email:"", phone:"", address:"", employer:"" });
  const [incomes, setIncomes] = useState([{ id:1, type:"Salary / Wages", source:"", ctc:"", tax:"", uif:"", pension:"", medical:"", otherDed:"" }]);
  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [extraTx, setExtraTx] = useState([]);
  const [importAccId, setImportAccId] = useState(accounts[0]?.id||1);
  const [preview, setPreview] = useState(null);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const fileRef = useRef();

  const allTx = useMemo(()=>[...expenses,...extraTx].filter(t=>t.date>=period.start&&t.date<=period.end),[expenses,extraTx,period]);
  const incomeTx = allTx.filter(t=>t.isIncome);
  const expTx = allTx.filter(t=>!t.isIncome);
  const totalExpenses = expTx.reduce((s,t)=>s+t.amount,0);
  const totalBankIncome = incomeTx.reduce((s,t)=>s+t.amount,0);
  const monthlyGross = incomes.reduce((s,i)=>s+(parseFloat(i.ctc)||0),0);
  const monthlyNett = incomes.reduce((s,i)=>{const ded=(parseFloat(i.tax)||0)+(parseFloat(i.uif)||0)+(parseFloat(i.pension)||0)+(parseFloat(i.medical)||0)+(parseFloat(i.otherDed)||0);return s+(parseFloat(i.ctc)||0)-ded;},0);
  const monthlyTotalDed = monthlyGross - monthlyNett;
  const declaredTotal = monthlyNett * 3;
  const discrepancy = Math.abs(totalBankIncome - declaredTotal);
  const bankAssets = accounts.filter(a=>a.balance>0).reduce((s,a)=>s+a.balance,0);
  const bankLiab = accounts.filter(a=>a.balance<0).reduce((s,a)=>s+Math.abs(a.balance),0);
  const financedLiab = assets.filter(a=>a.financed).reduce((s,a)=>{const p=parseFloat(a.finPrincipal)||0,dep=parseFloat(a.finDeposit)||0,r=parseFloat(a.finRate)||0,term=parseInt(a.finTerm)||0,left=parseInt(a.finTenorLeft)||0,bal=parseFloat(a.finBalloon)||0;const inst=calcInstalment(p-dep,r,term);return s+(inst*left+bal);},0);
  const manualLiab = liabilities.reduce((s,l)=>s+(parseFloat(l.balance)||0),0);
  const totalLiab = bankLiab + financedLiab + manualLiab;
  const totalAssets = assets.reduce((s,a)=>s+(parseFloat(a.value)||0),0)+bankAssets;
  const totalMonthlyPayments = assets.filter(a=>a.financed).reduce((s,a)=>s+(parseFloat(a.finActualPayment)||calcInstalment(parseFloat(a.finPrincipal||0)-parseFloat(a.finDeposit||0),parseFloat(a.finRate||0),parseInt(a.finTerm||0))),0)+liabilities.reduce((s,l)=>s+(parseFloat(l.payment)||0),0);
  const netWorth = totalAssets - totalLiab;
  const dti = monthlyNett > 0 ? ((totalMonthlyPayments/monthlyNett)*100).toFixed(1) : null;
  const otherTx = expTx.filter(t=>t.category==="Other");
  const uncatPct = expTx.length>0 ? Math.round(otherTx.length/expTx.length*100) : 0;
  const catSummary = useMemo(()=>{const map={};expTx.forEach(t=>{map[t.category]=(map[t.category]||0)+t.amount;});return Object.entries(map).sort((a,b)=>b[1]-a[1]);},[expTx]);

  const INCOME_TYPES = ["Salary / Wages","Director's Remuneration","Freelance / Contract","Rental Income","Investment / Dividends","Commission","Other Income"];
  const STEPS = ["Period","Personal","Income","Assets","Liabilities","Statements","Review","Report"];

  const handleFile = e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>setPreview({rows:csvToTx(ev.target.result,importAccId),name:file.name});reader.readAsText(file);e.target.value="";};
  const confirmImport = ()=>{if(!preview)return;const existing=new Set([...expenses,...extraTx].map(t=>`${t.desc}|${t.amount}|${t.date}`));const fresh=preview.rows.filter(r=>!existing.has(`${r.desc}|${r.amount}|${r.date}`));setExtraTx(p=>[...p,...fresh]);setPreview(null);setShowImportSheet(false);};
  const fixCat = (id,cat)=>setExtraTx(p=>p.map(t=>t.id===id?{...t,category:cat}:t));

  const ProgBar = ()=><div style={{display:"flex",gap:4,marginBottom:24}}>{STEPS.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:99,background:i<=step?"#1a1a1a":"#eee"}}/>)}</div>;
  const Nav = ()=>(
    <div style={{display:"flex",gap:10,marginTop:24}}>
      {step>0&&<button style={btnL} onClick={()=>setStep(s=>s-1)}>← Back</button>}
      {step<7&&<button style={btnD} onClick={()=>setStep(s=>s+1)}>{step===6?"Generate Report →":"Continue →"}</button>}
    </div>
  );

  if (step===7) return <ReportView {...{personal,period,incomes,assets,liabilities,allTx,incomeTx,expTx,catSummary,accounts,monthlyGross,monthlyNett,monthlyTotalDed,declaredTotal,totalBankIncome,totalAssets,totalLiab,bankLiab,financedLiab,manualLiab,totalMonthlyPayments,netWorth,dti,discrepancy,uncatPct,otherTx,bankAssets}} onBack={()=>setStep(6)} onClose={onClose}/>;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {STEPS.map((s,i)=><span key={i} style={{fontSize:10,fontWeight:i===step?700:400,color:i===step?"#1a1a1a":i<step?"#27ae60":"#ccc",cursor:i<step?"pointer":"default"}} onClick={()=>{if(i<step)setStep(i);}}>{i<step?"✓":i+1}{i===step?` ${s}`:""}</span>)}
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#ccc",fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      <ProgBar/>

      {step===0&&<div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:600}}>Select Report Period</h2>
        <p style={{margin:"0 0 20px",fontSize:14,color:"#888",lineHeight:1.6}}>SA financial institutions require the most recent 3 consecutive months of bank statements.</p>
        {[["Period Start","start"],["Period End","end"]].map(([label,key])=>(
          <div key={key} style={{marginBottom:14}}><label style={lbl}>{label}</label><input style={inp} type="date" value={period[key]} onChange={e=>setPeriod(p=>({...p,[key]:e.target.value}))}/></div>
        ))}
        <div style={{background:"#f0fff4",borderRadius:12,padding:"12px 16px",marginBottom:16}}><p style={{margin:0,fontSize:13,color:"#27ae60",fontWeight:500}}>✓ Period: <b>{period.start}</b> → <b>{period.end}</b></p></div>
        <Nav/>
      </div>}

      {step===1&&<div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:600}}>Personal Details</h2>
        <p style={{margin:"0 0 20px",fontSize:14,color:"#888"}}>As required for FICA compliance and credit applications.</p>
        {[["Full Legal Name (as per ID)","name","text","e.g. Thabo Nkosi"],["SA ID Number / Passport","idNumber","text","e.g. 8001015009087"],["Email Address","email","email","thabo@email.com"],["Mobile Number","phone","tel","082 000 0000"],["Residential Address","address","text","12 Jan Smuts Ave, Rosebank"],["Current Employer","employer","text","Acme (Pty) Ltd"]].map(([label,key,type,ph])=>(
          <div key={key} style={{marginBottom:14}}><label style={lbl}>{label}</label><input style={inp} type={type} placeholder={ph} value={personal[key]} onChange={e=>setPersonal(p=>({...p,[key]:e.target.value}))}/></div>
        ))}
        <Nav/>
      </div>}

      {step===2&&<div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:600}}>Income (Payslip View)</h2>
        <p style={{margin:"0 0 20px",fontSize:14,color:"#888",lineHeight:1.6}}>Enter gross CTC then deductions to arrive at nett received. Cross-verified against bank credits.</p>
        {incomes.map((inc,i)=><PayslipRow key={inc.id} item={inc} onChange={updated=>setIncomes(p=>p.map((x,j)=>j===i?updated:x))} onRemove={()=>setIncomes(p=>p.filter((_,j)=>j!==i))}/>)}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
          {INCOME_TYPES.map(t=><button key={t} onClick={()=>setIncomes(p=>[...p,{id:Date.now(),type:t,source:"",ctc:"",tax:"",uif:"",pension:"",medical:"",otherDed:""}])} style={{background:"#f5f5f5",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:500,cursor:"pointer",color:"#555",fontFamily:"inherit"}}>+ {t}</button>)}
        </div>
        <div style={{background:"#1a1a1a",borderRadius:12,padding:"14px 16px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
            {[["Total Gross CTC",fmt(monthlyGross),"#fff"],["Total Deductions",fmt(monthlyTotalDed),"#e74c3c"],["Total Nett Received",fmt(monthlyNett),"#27ae60"]].map(([k,v,c])=>(
              <div key={k}><p style={{margin:"0 0 2px",fontSize:10,color:"#888",textTransform:"uppercase"}}>{k}</p><p style={{margin:0,fontSize:13,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</p></div>
            ))}
          </div>
        </div>
        <Nav/>
      </div>}

      {step===3&&<div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:600}}>Assets</h2>
        <p style={{margin:"0 0 16px",fontSize:14,color:"#888",lineHeight:1.6}}>Bank balances are auto-included. Toggle financing on any asset to capture full terms.</p>
        <div style={{background:"#eff7ff",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
          <p style={{margin:"0 0 6px",fontSize:11,fontWeight:700,color:"#3498db",textTransform:"uppercase",letterSpacing:"0.06em"}}>Auto-included bank balances</p>
          {accounts.filter(a=>a.balance>0).map(a=><div key={a.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}><span style={{color:"#555"}}>{a.name}</span><span style={{fontWeight:600,fontFamily:"monospace"}}>{fmt(a.balance)}</span></div>)}
        </div>
        {assets.map((ast,i)=><AssetRow key={ast.id} item={ast} onChange={updated=>setAssets(p=>p.map((x,j)=>j===i?updated:x))} onRemove={()=>setAssets(p=>p.filter((_,j)=>j!==i))}/>)}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
          {ASSET_TYPES.map(t=><button key={t} onClick={()=>setAssets(p=>[...p,{id:Date.now(),type:t,desc:"",value:"",financed:false,finInstitution:"",finPrincipal:"",finDeposit:"",finRate:"",finTerm:"",finTenorLeft:"",finBalloon:"",finActualPayment:""}])} style={{background:"#f5f5f5",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:500,cursor:"pointer",color:"#555",fontFamily:"inherit"}}>+ {t}</button>)}
        </div>
        <div style={{background:"#f8f8f6",borderRadius:12,padding:"12px 16px"}}><p style={{margin:0,fontSize:13,fontWeight:600}}>Total Assets: {fmt(totalAssets)}</p></div>
        <Nav/>
      </div>}

      {step===4&&<div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:600}}>Additional Liabilities</h2>
        <p style={{margin:"0 0 16px",fontSize:14,color:"#888",lineHeight:1.6}}>Financed assets and credit accounts are auto-included. Add remaining debts here.</p>
        <div style={{background:"#fff0f0",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
          <p style={{margin:"0 0 6px",fontSize:11,fontWeight:700,color:"#e74c3c",textTransform:"uppercase",letterSpacing:"0.06em"}}>Auto-included</p>
          {accounts.filter(a=>a.balance<0).map(a=><div key={a.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}><span style={{color:"#555"}}>{a.name}</span><span style={{fontWeight:600,color:"#e74c3c",fontFamily:"monospace"}}>{fmt(Math.abs(a.balance))}</span></div>)}
          {assets.filter(a=>a.financed).map(a=>{const p=parseFloat(a.finPrincipal)||0,dep=parseFloat(a.finDeposit)||0,r=parseFloat(a.finRate)||0,term=parseInt(a.finTerm)||0,left=parseInt(a.finTenorLeft)||0,bal=parseFloat(a.finBalloon)||0;const balance=calcInstalment(p-dep,r,term)*left+bal;return balance>0?<div key={a.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}><span style={{color:"#555"}}>{a.finInstitution||a.type} — {a.desc}</span><span style={{fontWeight:600,color:"#e74c3c",fontFamily:"monospace"}}>{fmt(balance)}</span></div>:null;})}
        </div>
        {liabilities.map((lib,i)=><LiabilityRow key={lib.id} item={lib} onChange={updated=>setLiabilities(p=>p.map((x,j)=>j===i?updated:x))} onRemove={()=>setLiabilities(p=>p.filter((_,j)=>j!==i))}/>)}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
          {LIABILITY_TYPES.map(t=><button key={t} onClick={()=>setLiabilities(p=>[...p,{id:Date.now(),type:t,desc:"",balance:"",payment:""}])} style={{background:"#f5f5f5",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:500,cursor:"pointer",color:"#555",fontFamily:"inherit"}}>+ {t}</button>)}
        </div>
        <div style={{background:"#f8f8f6",borderRadius:12,padding:"12px 16px"}}><p style={{margin:"0 0 2px",fontSize:13,fontWeight:600}}>Total Liabilities: {fmt(totalLiab)}</p><p style={{margin:0,fontSize:13,color:"#888"}}>Monthly obligations: {fmt(totalMonthlyPayments)}</p></div>
        <Nav/>
      </div>}

      {step===5&&<div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:600}}>Bank Statements</h2>
        <p style={{margin:"0 0 20px",fontSize:14,color:"#888",lineHeight:1.6}}>Upload CSV exports for the 3-month period. Income and expenses are detected and cross-verified.</p>
        {accounts.map(acc=>{const cnt=allTx.filter(t=>t.account===acc.id).length;return(
          <div key={acc.id} style={{background:"#fff",borderRadius:14,padding:"16px 18px",marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><p style={{margin:0,fontSize:14,fontWeight:600}}>{acc.name}</p><p style={{margin:0,fontSize:12,color:"#aaa"}}>{cnt} transactions in period</p></div>
            <button onClick={()=>{setImportAccId(acc.id);setPreview(null);setShowImportSheet(true);}} style={{background:cnt>0?"#f0fff4":"#f5f5f5",border:"none",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:600,color:cnt>0?"#27ae60":"#888",cursor:"pointer",fontFamily:"inherit"}}>{cnt>0?"✓ Uploaded":"↑ Upload CSV"}</button>
          </div>
        );})}
        {otherTx.length>0&&<div style={{background:"#fffbf0",borderRadius:12,padding:16,marginTop:8}}>
          <p style={{margin:"0 0 12px",fontSize:13,fontWeight:600,color:"#e67e22"}}>⚠️ {otherTx.length} uncategorized — assign categories</p>
          {otherTx.map(tx=><div key={tx.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:13,color:"#555",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.desc} <span style={{color:"#aaa"}}>({fmt(tx.amount)})</span></span><select style={{...inp,width:"auto",padding:"6px 10px",fontSize:12}} defaultValue="Other" onChange={e=>fixCat(tx.id,e.target.value)}>{CATEGORIES.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></div>)}
        </div>}
        <div style={{background:"#f8f8f6",borderRadius:12,padding:"12px 16px",marginTop:14}}><p style={{margin:"0 0 2px",fontSize:13,fontWeight:600}}>{allTx.length} transactions in period</p><p style={{margin:"0 0 2px",fontSize:13,color:"#888"}}>Credits: {fmt(totalBankIncome)} · Debits: {fmt(totalExpenses)}</p>{discrepancy>500&&<p style={{margin:"4px 0 0",fontSize:12,color:"#e67e22",fontWeight:500}}>⚠️ {fmt(discrepancy)} discrepancy vs declared nett income</p>}</div>
        <div style={{background:"#f8f8f6",borderRadius:12,padding:"14px 16px",marginTop:12}}>
          <p style={{margin:"0 0 8px",fontSize:12,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.06em"}}>How to export from SA banks</p>
          {[["FNB","My Bank Accounts → Statements → Export CSV"],["Absa","View Transactions → Download CSV"],["Standard Bank","Accounts → View Statement → Export → CSV"],["Nedbank","Transact → Account → Download Statement → CSV"],["Capitec","App → Transactions → Export"],["Investec","Account Activity → Export → CSV"]].map(([bank,steps])=><div key={bank} style={{marginBottom:5}}><span style={{fontSize:12,fontWeight:600,color:"#555"}}>{bank}: </span><span style={{fontSize:12,color:"#999"}}>{steps}</span></div>)}
        </div>
        <Nav/>
        {showImportSheet&&<Sheet onClose={()=>{setShowImportSheet(false);setPreview(null);}}>
          <h3 style={{margin:"0 0 6px",fontSize:18,fontWeight:600}}>Upload Statement CSV</h3>
          <p style={{margin:"0 0 16px",fontSize:13,color:"#888"}}>For: {accounts.find(a=>a.id===importAccId)?.name}</p>
          {!preview?(<><input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleFile}/><button onClick={()=>fileRef.current.click()} style={btnD}>Choose CSV File</button></>):(<>
            <div style={{background:"#f8f8f6",borderRadius:12,padding:14,marginBottom:14}}><p style={{margin:"0 0 4px",fontSize:13,fontWeight:600}}>📄 {preview.name} — {preview.rows.length} rows</p><div style={{maxHeight:200,overflowY:"auto",marginTop:10}}>{preview.rows.slice(0,8).map((r,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #eee",fontSize:12,gap:8}}><span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#555"}}>{r.desc}</span><span style={{color:r.isIncome?"#27ae60":"#aaa",flexShrink:0}}>{r.isIncome?"↑ Credit":r.category}</span><span style={{fontFamily:"monospace",fontWeight:600,flexShrink:0,color:r.isIncome?"#27ae60":"#1a1a1a"}}>{r.isIncome?"+":"-"}{fmt(r.amount)}</span></div>)}{preview.rows.length>8&&<p style={{margin:"8px 0 0",fontSize:12,color:"#aaa",textAlign:"center"}}>+{preview.rows.length-8} more</p>}</div></div>
            <button onClick={confirmImport} style={btnD}>Import {preview.rows.length} Transactions</button>
            <button onClick={()=>setPreview(null)} style={{...btnL,marginTop:10}}>Choose Different File</button>
          </>)}
          <button onClick={()=>{setShowImportSheet(false);setPreview(null);}} style={{...btnL,marginTop:10,color:"#bbb",background:"none"}}>Cancel</button>
        </Sheet>}
      </div>}

      {step===6&&<div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:600}}>Review</h2>
        <p style={{margin:"0 0 20px",fontSize:14,color:"#888"}}>Verify all figures before generating.</p>
        {discrepancy>1000&&<div style={{background:"#fff3cd",borderRadius:12,padding:"14px 16px",marginBottom:14,borderLeft:"4px solid #ffc107"}}><p style={{margin:"0 0 4px",fontSize:13,fontWeight:700,color:"#856404"}}>⚠️ Income Discrepancy</p><p style={{margin:"0 0 2px",fontSize:13,color:"#856404"}}>Declared nett: {fmt(declaredTotal)} · Bank credits: {fmt(totalBankIncome)} · Diff: {fmt(discrepancy)}</p></div>}
        {uncatPct>20&&<div style={{background:"#fff3cd",borderRadius:12,padding:"14px 16px",marginBottom:14,borderLeft:"4px solid #ffc107"}}><p style={{margin:"0 0 2px",fontSize:13,fontWeight:700,color:"#856404"}}>⚠️ {uncatPct}% Uncategorized Expenses</p></div>}
        {[["Report Period",`${period.start} → ${period.end}`,null],["Applicant",personal.name||"Not entered",null],["Monthly Gross CTC",fmt(monthlyGross),"#555"],["Monthly Deductions",fmt(monthlyTotalDed),"#e74c3c"],["Monthly Nett Income",fmt(monthlyNett),"#27ae60"],["3-Month Expenses",fmt(totalExpenses),"#e74c3c"],["Net Worth",fmt(netWorth),netWorth>=0?"#1a1a1a":"#e74c3c"],["Debt-to-Income",dti?`${dti}%`:"N/A",dti&&parseFloat(dti)>43?"#e74c3c":"#27ae60"],["Transactions",`${allTx.length}`,null],["Uncategorized",`${otherTx.length} (${uncatPct}%)`,uncatPct>20?"#e67e22":"#27ae60"]].map(([label,value,color])=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #f5f5f5"}}><span style={{fontSize:14,color:"#666"}}>{label}</span><span style={{fontSize:14,fontWeight:600,color:color||"#1a1a1a"}}>{value}</span></div>
        ))}
        <Nav/>
      </div>}
    </div>
  );
}

// ─── Report View ──────────────────────────────────────────────────────────────
function ReportView({ personal, period, incomes, assets, liabilities, allTx, incomeTx, expTx, catSummary, accounts, monthlyGross, monthlyNett, monthlyTotalDed, declaredTotal, totalBankIncome, totalAssets, totalLiab, bankLiab, financedLiab, manualLiab, totalMonthlyPayments, netWorth, dti, discrepancy, uncatPct, otherTx, bankAssets, onBack, onClose }) {
  const now = new Date().toLocaleDateString("en-ZA",{year:"numeric",month:"long",day:"numeric"});
  const totalExpenses = expTx.reduce((s,t)=>s+t.amount,0);
  const Row = ({label,value,bold,color,indent,sub})=>(<div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f5f5f5"}}><span style={{fontSize:13,color:sub?"#bbb":indent?"#888":"#555",paddingLeft:indent?14:0,fontStyle:sub?"italic":"normal"}}>{label}</span><span style={{fontSize:13,fontWeight:bold?700:500,color:color||"#1a1a1a",fontFamily:"monospace"}}>{value}</span></div>);
  const Sec = ({title,accent="#1a1a1a",children})=>(<div style={{marginBottom:24}}><div style={{borderBottom:`2px solid ${accent}`,paddingBottom:8,marginBottom:12}}><span style={{fontSize:12,fontWeight:700,color:accent,textTransform:"uppercase",letterSpacing:"0.1em"}}>{title}</span></div>{children}</div>);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <button onClick={onBack} style={{...btnL,width:"auto",padding:"8px 16px",fontSize:13}}>← Edit</button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>window.print()} style={{...btnD,width:"auto",padding:"8px 16px",fontSize:13}}>🖨️ Print / PDF</button>
          <button onClick={onClose} style={{...btnL,width:"auto",padding:"8px 16px",fontSize:13}}>✕</button>
        </div>
      </div>
      <div style={{background:"#1a1a1a",color:"#fff",borderRadius:16,padding:"24px",marginBottom:20}}>
        <p style={{margin:"0 0 2px",fontSize:11,color:"#888",letterSpacing:"0.12em",textTransform:"uppercase"}}>3-Month Financial Statement — South Africa</p>
        <h2 style={{margin:"0 0 16px",fontSize:20,fontWeight:300}}>Income &amp; Expenditure Report</h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",fontSize:12}}>
          {[["Applicant",personal.name||"—"],["ID Number",personal.idNumber||"—"],["Date",now],["Period",`${period.start} → ${period.end}`],["Employer",personal.employer||"—"],["Contact",personal.phone||"—"]].map(([k,v])=><div key={k}><span style={{color:"#888"}}>{k}: </span><b>{v}</b></div>)}
        </div>
      </div>
      {discrepancy>1000&&<div style={{background:"#fff3cd",borderRadius:12,padding:"12px 16px",marginBottom:14,borderLeft:"4px solid #ffc107"}}><p style={{margin:0,fontSize:13,fontWeight:600,color:"#856404"}}>⚠️ Income discrepancy of {fmt(discrepancy)}</p></div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
        {[["Nett Monthly Income",fmt(monthlyNett),"#27ae60"],["Avg Monthly Expenses",fmt(totalExpenses/3),"#e74c3c"],["Net Worth",fmt(netWorth),netWorth>=0?"#1a1a1a":"#e74c3c"],["Debt-to-Income",dti?`${dti}%`:"N/A",dti&&parseFloat(dti)>43?"#e74c3c":"#27ae60"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#f8f8f6",borderRadius:12,padding:"14px 16px"}}><p style={{margin:"0 0 4px",fontSize:11,color:"#aaa",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</p><p style={{margin:0,fontSize:18,fontWeight:300,color:c,fontFamily:"monospace"}}>{v}</p></div>
        ))}
      </div>
      <Sec title="1. Income Statement (Payslip Basis)" accent="#27ae60">
        {incomes.map((inc,i)=>{const ded=(parseFloat(inc.tax)||0)+(parseFloat(inc.uif)||0)+(parseFloat(inc.pension)||0)+(parseFloat(inc.medical)||0)+(parseFloat(inc.otherDed)||0);const nett=(parseFloat(inc.ctc)||0)-ded;return(<div key={i} style={{marginBottom:14}}>
          <Row label={`${inc.type}${inc.source?` — ${inc.source}`:""}`} value="" bold/>
          <Row indent label="Gross / CTC (monthly)" value={fmt(parseFloat(inc.ctc)||0)}/>
          {parseFloat(inc.tax)>0&&<Row indent label="Less: PAYE / Income Tax" value={`(${fmt(parseFloat(inc.tax))})`} color="#e74c3c"/>}
          {parseFloat(inc.uif)>0&&<Row indent label="Less: UIF" value={`(${fmt(parseFloat(inc.uif))})`} color="#e74c3c"/>}
          {parseFloat(inc.pension)>0&&<Row indent label="Less: Pension / Provident" value={`(${fmt(parseFloat(inc.pension))})`} color="#e74c3c"/>}
          {parseFloat(inc.medical)>0&&<Row indent label="Less: Medical Aid" value={`(${fmt(parseFloat(inc.medical))})`} color="#e74c3c"/>}
          {parseFloat(inc.otherDed)>0&&<Row indent label="Less: Other Deductions" value={`(${fmt(parseFloat(inc.otherDed))})`} color="#e74c3c"/>}
          <Row indent label="Nett Received (monthly)" value={fmt(nett)} bold color="#27ae60"/>
          <Row sub indent label="  3-month nett total" value={fmt(nett*3)} color="#27ae60"/>
        </div>);})}
        <Row label="TOTAL MONTHLY GROSS CTC" value={fmt(monthlyGross)} bold/>
        <Row label="TOTAL MONTHLY DEDUCTIONS" value={`(${fmt(monthlyTotalDed)})`} bold color="#e74c3c"/>
        <Row label="TOTAL MONTHLY NETT INCOME" value={fmt(monthlyNett)} bold color="#27ae60"/>
        <div style={{height:8}}/>
        <Row label="Bank Verified Credits (3 months)" value={fmt(totalBankIncome)} color="#27ae60"/>
        {incomeTx.slice(0,6).map((t,i)=><Row key={i} indent label={`${t.date} · ${t.desc}`} value={fmt(t.amount)} color="#27ae60"/>)}
        {discrepancy>500&&<Row label="⚠️ Discrepancy (nett vs bank)" value={fmt(discrepancy)} bold color="#e67e22"/>}
      </Sec>
      <Sec title="2. Expenditure Statement (3-Month Period)" accent="#e74c3c">
        {catSummary.map(([cat,total])=>{const c=CATEGORIES.find(x=>x.name===cat);return <Row key={cat} indent label={`${c?.icon||""} ${cat}`} value={fmt(total)}/>;  })}
        <Row label="Total Expenditure (3 months)" value={fmt(totalExpenses)} bold color="#e74c3c"/>
        <Row label="Monthly Average" value={fmt(totalExpenses/3)} bold/>
        <Row label="Net Monthly Cash Flow" value={fmt(monthlyNett-totalExpenses/3)} bold color={monthlyNett-totalExpenses/3>=0?"#27ae60":"#e74c3c"}/>
        <div style={{height:8}}/>
        <Row label="Transactions Analysed" value={`${allTx.length}`}/>
        <Row label="Uncategorized / Other" value={`${otherTx.length} (${uncatPct}%)`} color={uncatPct>20?"#e67e22":"#555"}/>
      </Sec>
      <Sec title="3. Assets" accent="#3498db">
        {accounts.filter(a=>a.balance>0).map(a=><Row key={a.id} indent label={a.name} value={fmt(a.balance)}/>)}
        {assets.map((a,i)=><div key={i}><Row indent label={`${a.type}${a.desc?` — ${a.desc}`:""}`} value={fmt(parseFloat(a.value)||0)}/>{a.financed&&a.finInstitution&&<Row indent sub label={`  Financed: ${a.finInstitution} | ${a.finRate||"—"}% | ${a.finTenorLeft||"—"} months left`} value=""/>}</div>)}
        <Row label="TOTAL ASSETS" value={fmt(totalAssets)} bold color="#3498db"/>
      </Sec>
      <Sec title="4. Liabilities" accent="#e74c3c">
        {accounts.filter(a=>a.balance<0).map(a=><Row key={a.id} indent label={a.name} value={fmt(Math.abs(a.balance))}/>)}
        {assets.filter(a=>a.financed).map((a,i)=>{const p=parseFloat(a.finPrincipal)||0,dep=parseFloat(a.finDeposit)||0,r=parseFloat(a.finRate)||0,term=parseInt(a.finTerm)||0,left=parseInt(a.finTenorLeft)||0,bal=parseFloat(a.finBalloon)||0;const inst=calcInstalment(p-dep,r,term);const outstanding=inst*left+bal;const actual=parseFloat(a.finActualPayment)||inst;const diff=Math.abs(actual-inst);return(<div key={i}><Row indent label={`${a.type} — ${a.desc||""}`} value={fmt(outstanding)}/><Row indent sub label={`  ${a.finInstitution||"Financier"} | ${a.finRate||"—"}% p.a. | ${left} months left | Balloon: ${fmt(bal)}`} value=""/><Row indent sub label={`  Calc. instalment: ${fmt(inst)} | Actual: ${fmt(actual)}`} value={diff>50?`⚠️ ${fmt(diff)} diff`:"✓ Match"} color={diff>50?"#e67e22":"#27ae60"}/></div>);})}
        {liabilities.map((l,i)=><div key={i}><Row indent label={`${l.type}${l.desc?` — ${l.desc}`:""}`} value={fmt(parseFloat(l.balance)||0)}/>{l.payment&&<Row indent sub label={`  Monthly payment: ${fmt(parseFloat(l.payment))}`} value=""/>}</div>)}
        <Row label="TOTAL LIABILITIES" value={fmt(totalLiab)} bold color="#e74c3c"/>
        <Row label="Total Monthly Obligations" value={fmt(totalMonthlyPayments)} bold/>
      </Sec>
      <Sec title="5. Net Financial Position &amp; Affordability">
        <Row label="Total Assets" value={fmt(totalAssets)} color="#3498db"/>
        <Row label="Total Liabilities" value={fmt(totalLiab)} color="#e74c3c"/>
        <Row label="NET WORTH (EQUITY)" value={fmt(netWorth)} bold color={netWorth>=0?"#1a1a1a":"#e74c3c"}/>
        <div style={{height:8}}/>
        <Row label="Monthly Nett Income" value={fmt(monthlyNett)}/>
        <Row label="Monthly Debt Obligations" value={fmt(totalMonthlyPayments)}/>
        <Row label="Monthly Surplus" value={fmt(monthlyNett-totalMonthlyPayments)} color={monthlyNett-totalMonthlyPayments>=0?"#27ae60":"#e74c3c"}/>
        <Row label="DEBT-TO-INCOME RATIO (DTI)" value={dti?`${dti}%`:"N/A"} bold color={dti&&parseFloat(dti)>43?"#e74c3c":"#27ae60"}/>
        {dti&&<div style={{background:parseFloat(dti)>43?"#fff0f0":"#f0fff4",borderRadius:10,padding:"10px 14px",marginTop:10}}><p style={{margin:0,fontSize:12,fontWeight:500,color:parseFloat(dti)>43?"#c0392b":"#27ae60"}}>{parseFloat(dti)<=30?"✓ Strong affordability — well within NCR guidelines":parseFloat(dti)<=43?"✓ Acceptable DTI — within NCA affordability limits":"✗ High DTI — exceeds recommended 43% NCA affordability threshold"}</p></div>}
      </Sec>
      <div style={{borderTop:"2px solid #1a1a1a",paddingTop:20,marginTop:8}}>
        <p style={{fontSize:11,color:"#aaa",lineHeight:1.8,marginBottom:20}}>I, <b>{personal.name||"_______________"}</b> (ID: <b>{personal.idNumber||"_______________"}</b>), hereby declare that the information provided is true and accurate, constituting full financial disclosure as required under the National Credit Act (NCA) No. 34 of 2005. Prepared on <b>{now}</b> for the period <b>{period.start}</b> to <b>{period.end}</b>.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>{["Applicant Signature","Date"].map(l=><div key={l}><div style={{borderBottom:"1px solid #1a1a1a",height:36,marginBottom:4}}/><p style={{margin:0,fontSize:11,color:"#aaa"}}>{l}</p></div>)}</div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("overview");

  // ── Persistent state ───────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState(() => load("ft_accounts", INIT_ACCOUNTS));
  const [expenses, setExpenses] = useState(() => load("ft_expenses", INIT_EXPENSES));

  useEffect(() => { save("ft_accounts", accounts); }, [accounts]);
  useEffect(() => { save("ft_expenses", expenses); }, [expenses]);
  // ──────────────────────────────────────────────────────────────────────────

  const [showAddExp, setShowAddExp] = useState(false);
  const [showAddAcc, setShowAddAcc] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [importAccId, setImportAccId] = useState(1);
  const [importPreview, setImportPreview] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [newExp, setNewExp] = useState({ desc:"", amount:"", category:"Food", account:1, date:new Date().toISOString().slice(0,10) });
  const [newAcc, setNewAcc] = useState({ name:"", balance:"", type:"Cheque" });
  const fileRef = useRef();

  const totalAssets = accounts.filter(a=>a.balance>0).reduce((s,a)=>s+a.balance,0);
  const totalDebt = accounts.filter(a=>a.balance<0).reduce((s,a)=>s+a.balance,0);
  const netWorth = totalAssets + totalDebt;
  const visExp = expenses.filter(e=>!e.isIncome);

  const catTotals = useMemo(()=>{const map={};visExp.forEach(e=>{map[e.category]=(map[e.category]||0)+e.amount;});return CATEGORIES.map(c=>({...c,value:map[c.name]||0})).filter(c=>c.value>0);},[visExp]);
  const monthlyData = useMemo(()=>{const map={};visExp.forEach(e=>{const m=new Date(e.date).getMonth();map[m]=(map[m]||0)+e.amount;});return Object.entries(map).sort((a,b)=>+a[0]-+b[0]).map(([m,v])=>({month:MONTHS[+m],amount:v}));},[visExp]);

  const addExp=()=>{if(!newExp.desc||!newExp.amount)return;setExpenses(p=>[...p,{...newExp,id:Date.now(),amount:parseFloat(newExp.amount),isIncome:false}]);setNewExp({desc:"",amount:"",category:"Food",account:accounts[0]?.id||1,date:new Date().toISOString().slice(0,10)});setShowAddExp(false);};
  const addAcc=()=>{if(!newAcc.name||newAcc.balance==="")return;const colors=["#1a1a1a","#444","#777","#aaa","#bbb"];setAccounts(p=>[...p,{...newAcc,id:Date.now(),balance:parseFloat(newAcc.balance),color:colors[p.length%colors.length]}]);setNewAcc({name:"",balance:"",type:"Cheque"});setShowAddAcc(false);};
  const handleFile=e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>{const parsed=csvToTx(ev.target.result,importAccId);setImportPreview({rows:parsed,name:file.name});};reader.readAsText(file);e.target.value="";};
  const confirmImport=()=>{if(!importPreview)return;const existing=new Set(expenses.map(e=>`${e.desc}|${e.amount}|${e.date}`));const fresh=importPreview.rows.filter(r=>!existing.has(`${r.desc}|${r.amount}|${r.date}`));const skipped=importPreview.rows.length-fresh.length;setExpenses(p=>[...p,...fresh]);setImportMsg(`✓ Imported ${fresh.length} transactions${skipped>0?` · ${skipped} duplicates skipped`:""}.`);setImportPreview(null);setTimeout(()=>{setShowImport(false);setImportMsg(null);},2500);};

  const resetData=()=>{if(window.confirm("Clear all data and start fresh?")){ localStorage.removeItem("ft_accounts"); localStorage.removeItem("ft_expenses"); setAccounts(INIT_ACCOUNTS); setExpenses(INIT_EXPENSES); }};

  return (
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f8f8f6",minHeight:"100vh",maxWidth:430,margin:"0 auto",paddingBottom:80}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      <div style={{background:"#fff",padding:"52px 24px 20px",borderBottom:"1px solid #f0f0f0"}}>
        <p style={{margin:0,fontSize:12,color:"#999",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase"}}>Net Worth</p>
        <h1 style={{margin:"4px 0 0",fontSize:36,fontWeight:300,letterSpacing:"-0.03em",color:"#1a1a1a"}}>{fmt(netWorth)}</h1>
        <div style={{display:"flex",gap:16,marginTop:10,alignItems:"center"}}>
          <span style={{fontSize:13,color:"#666"}}>Assets <b style={{color:"#1a1a1a"}}>{fmt(totalAssets)}</b></span>
          <span style={{fontSize:13,color:"#666"}}>Debt <b style={{color:"#c0392b"}}>{fmt(Math.abs(totalDebt))}</b></span>
          <button onClick={()=>setShowReport(true)} style={{marginLeft:"auto",background:"#1a1a1a",color:"#fff",border:"none",borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>📋 Credit Report</button>
        </div>
      </div>

      <div style={{display:"flex",background:"#fff",padding:"0 24px",borderBottom:"1px solid #f0f0f0"}}>
        {["overview","accounts","expenses","insights"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",padding:"14px 0",marginRight:24,cursor:"pointer",fontSize:13,fontWeight:tab===t?600:400,color:tab===t?"#1a1a1a":"#999",borderBottom:tab===t?"2px solid #1a1a1a":"2px solid transparent",textTransform:"capitalize",fontFamily:"inherit"}}>{t}</button>
        ))}
      </div>

      <div style={{padding:"20px 24px"}}>
        {tab==="overview"&&<>
          <p style={{margin:"0 0 14px",fontSize:13,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.08em"}}>Accounts</p>
          {accounts.map(a=>(
            <div key={a.id} style={{background:"#fff",borderRadius:14,padding:"16px 18px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:10,height:10,borderRadius:"50%",background:a.color}}/><div><p style={{margin:0,fontSize:14,fontWeight:500}}>{a.name}</p><p style={{margin:0,fontSize:12,color:"#aaa"}}>{a.type}</p></div></div>
              <p style={{margin:0,fontSize:16,fontWeight:600,color:a.balance<0?"#c0392b":"#1a1a1a",fontFamily:"'DM Mono',monospace"}}>{fmt(a.balance)}</p>
            </div>
          ))}
          <p style={{margin:"22px 0 14px",fontSize:13,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.08em"}}>Recent Expenses</p>
          {visExp.slice(-5).reverse().map(e=>{const cat=CATEGORIES.find(c=>c.name===e.category);return(
            <div key={e.id} style={{background:"#fff",borderRadius:14,padding:"14px 18px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:20}}>{cat?.icon}</span><div><p style={{margin:0,fontSize:14,fontWeight:500}}>{e.desc}</p><p style={{margin:0,fontSize:12,color:"#aaa"}}>{e.category} · {e.date}</p></div></div>
              <p style={{margin:0,fontSize:15,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>−{fmt(e.amount)}</p>
            </div>
          );})}
          <button onClick={resetData} style={{marginTop:16,background:"none",border:"none",fontSize:12,color:"#ddd",cursor:"pointer",fontFamily:"inherit"}}>Reset all data</button>
        </>}

        {tab==="accounts"&&<>
          {accounts.map(a=>{const spent=visExp.filter(e=>e.account===a.id).reduce((s,e)=>s+e.amount,0);return(
            <div key={a.id} style={{background:"#fff",borderRadius:16,padding:20,marginBottom:12,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><p style={{margin:0,fontSize:12,color:"#aaa",fontWeight:500}}>{a.type.toUpperCase()}</p><p style={{margin:"3px 0 0",fontSize:17,fontWeight:600}}>{a.name}</p></div><p style={{margin:0,fontSize:22,fontWeight:300,color:a.balance<0?"#c0392b":"#1a1a1a",fontFamily:"'DM Mono',monospace"}}>{fmt(a.balance)}</p></div>
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #f5f5f5",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"#999"}}>Tracked spending</span><span style={{fontSize:13,fontWeight:600,color:"#555",fontFamily:"'DM Mono',monospace"}}>{fmt(spent)}</span></div>
              <button onClick={()=>{setImportAccId(a.id);setImportPreview(null);setShowImport(true);}} style={{marginTop:12,background:"none",border:"1.5px dashed #ddd",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:600,color:"#888",cursor:"pointer",fontFamily:"inherit",width:"100%"}}>↑ Import CSV</button>
            </div>
          );})}
          <button onClick={()=>setShowAddAcc(true)} style={{...btnL,border:"1.5px dashed #d5d5d5",background:"none",color:"#1a1a1a",marginTop:4}}>+ Add Account</button>
          {showAddAcc&&<Sheet onClose={()=>setShowAddAcc(false)}>
            <h3 style={{margin:"0 0 20px",fontSize:18,fontWeight:600}}>Add Account</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <input style={inp} placeholder="Account name" value={newAcc.name} onChange={e=>setNewAcc(p=>({...p,name:e.target.value}))}/>
              <input style={inp} type="number" placeholder="Balance (− for debt)" value={newAcc.balance} onChange={e=>setNewAcc(p=>({...p,balance:e.target.value}))}/>
              <select style={inp} value={newAcc.type} onChange={e=>setNewAcc(p=>({...p,type:e.target.value}))}>{["Cheque","Savings","Credit","Investment"].map(t=><option key={t}>{t}</option>)}</select>
              <button onClick={addAcc} style={btnD}>Add Account</button>
              <button onClick={()=>setShowAddAcc(false)} style={btnL}>Cancel</button>
            </div>
          </Sheet>}
        </>}

        {tab==="expenses"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div><p style={{margin:0,fontSize:12,color:"#999",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.08em"}}>Total Tracked</p><p style={{margin:"2px 0 0",fontSize:26,fontWeight:300,fontFamily:"'DM Mono',monospace"}}>{fmt(visExp.reduce((s,e)=>s+e.amount,0))}</p></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setImportAccId(accounts[0]?.id);setImportPreview(null);setShowImport(true);}} style={{background:"#f5f5f5",color:"#555",border:"none",borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>↑ CSV</button>
              <button onClick={()=>setShowAddExp(true)} style={{background:"#1a1a1a",color:"#fff",border:"none",borderRadius:12,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>+ Add</button>
            </div>
          </div>
          {visExp.slice().reverse().map(e=>{const cat=CATEGORIES.find(c=>c.name===e.category);const acc=accounts.find(a=>a.id===e.account);return(
            <div key={e.id} style={{background:"#fff",borderRadius:14,padding:"14px 18px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:40,height:40,borderRadius:12,background:"#f5f5f5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{cat?.icon}</div><div><p style={{margin:0,fontSize:14,fontWeight:500}}>{e.desc}</p><p style={{margin:0,fontSize:12,color:"#aaa"}}>{e.category} · {acc?.name||"—"}</p></div></div>
              <div style={{textAlign:"right"}}><p style={{margin:0,fontSize:15,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>−{fmt(e.amount)}</p><p style={{margin:0,fontSize:12,color:"#ccc"}}>{e.date}</p></div>
            </div>
          );})}
          {showAddExp&&<Sheet onClose={()=>setShowAddExp(false)}>
            <h3 style={{margin:"0 0 20px",fontSize:18,fontWeight:600}}>Add Expense</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <input style={inp} placeholder="Description" value={newExp.desc} onChange={e=>setNewExp(p=>({...p,desc:e.target.value}))}/>
              <input style={inp} type="number" placeholder="Amount (R)" value={newExp.amount} onChange={e=>setNewExp(p=>({...p,amount:e.target.value}))}/>
              <select style={inp} value={newExp.category} onChange={e=>setNewExp(p=>({...p,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c.name}>{c.name}</option>)}</select>
              <select style={inp} value={newExp.account} onChange={e=>setNewExp(p=>({...p,account:parseInt(e.target.value)}))}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <input style={inp} type="date" value={newExp.date} onChange={e=>setNewExp(p=>({...p,date:e.target.value}))}/>
              <button onClick={addExp} style={btnD}>Add Expense</button>
              <button onClick={()=>setShowAddExp(false)} style={btnL}>Cancel</button>
            </div>
          </Sheet>}
        </>}

        {tab==="insights"&&<>
          <p style={{margin:"0 0 14px",fontSize:13,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.08em"}}>Spending by Category</p>
          <div style={{background:"#fff",borderRadius:16,padding:20,marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={catTotals} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>{catTotals.map((entry,i)=><Cell key={i} fill={entry.color}/>)}</Pie><Tooltip formatter={v=>fmt(v)} contentStyle={{fontFamily:"DM Sans",fontSize:13,borderRadius:10,border:"1px solid #eee"}}/></PieChart></ResponsiveContainer>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>{catTotals.map(c=><div key={c.name} style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0}}/><span style={{fontSize:12,color:"#666"}}>{c.icon} {c.name}</span><span style={{fontSize:12,fontWeight:600,marginLeft:"auto",fontFamily:"'DM Mono',monospace"}}>{fmt(c.value)}</span></div>)}</div>
          </div>
          <p style={{margin:"0 0 14px",fontSize:13,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.08em"}}>Monthly Spending</p>
          <div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <ResponsiveContainer width="100%" height={180}><BarChart data={monthlyData} barSize={28}><XAxis dataKey="month" tick={{fontSize:12,fontFamily:"DM Sans",fill:"#aaa"}} axisLine={false} tickLine={false}/><YAxis hide/><Tooltip formatter={v=>fmt(v)} contentStyle={{fontFamily:"DM Sans",fontSize:13,borderRadius:10,border:"1px solid #eee"}} cursor={{fill:"#f5f5f5"}}/><Bar dataKey="amount" fill="#1a1a1a" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
          </div>
          <div style={{background:"#fff",borderRadius:16,padding:20,marginTop:12,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <p style={{margin:"0 0 14px",fontSize:13,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:"0.08em"}}>Breakdown</p>
            {[...catTotals].sort((a,b)=>b.value-a.value).map(c=>{const total=catTotals.reduce((s,x)=>s+x.value,0);const pct=Math.round((c.value/total)*100);return(
              <div key={c.name} style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:13,color:"#444"}}>{c.icon} {c.name}</span><span style={{fontSize:13,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{pct}%</span></div><div style={{height:5,background:"#f0f0f0",borderRadius:99}}><div style={{height:"100%",width:`${pct}%`,background:"#1a1a1a",borderRadius:99}}/></div></div>
            );})}
          </div>
        </>}
      </div>

      {showImport&&<Sheet onClose={()=>{setShowImport(false);setImportPreview(null);setImportMsg(null);}}>
        <h3 style={{margin:"0 0 6px",fontSize:18,fontWeight:600}}>Import Bank CSV</h3>
        <p style={{margin:"0 0 16px",fontSize:13,color:"#888"}}>Works with FNB, Absa, Standard Bank, Nedbank, Capitec & Investec.</p>
        <select style={{...inp,marginBottom:16}} value={importAccId} onChange={e=>setImportAccId(parseInt(e.target.value))}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {!importPreview?(<><input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleFile}/><button onClick={()=>fileRef.current.click()} style={btnD}>Choose CSV File</button></>):(
          <><div style={{background:"#f8f8f6",borderRadius:12,padding:14,marginBottom:14}}><p style={{margin:"0 0 4px",fontSize:13,fontWeight:600}}>📄 {importPreview.name} — {importPreview.rows.length} rows</p><div style={{maxHeight:200,overflowY:"auto",marginTop:10}}>{importPreview.rows.slice(0,8).map((r,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #eee",fontSize:12,gap:8}}><span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#555"}}>{r.desc}</span><span style={{color:"#aaa",flexShrink:0}}>{r.category}</span><span style={{fontFamily:"monospace",fontWeight:600,flexShrink:0}}>{fmt(r.amount)}</span></div>)}</div></div>
          <button onClick={confirmImport} style={btnD}>Import {importPreview.rows.length} Transactions</button><button onClick={()=>setImportPreview(null)} style={{...btnL,marginTop:10}}>Choose Different File</button></>
        )}
        {importMsg&&<p style={{margin:"12px 0 0",fontSize:14,fontWeight:600,color:"#27ae60",textAlign:"center"}}>{importMsg}</p>}
        <button onClick={()=>{setShowImport(false);setImportPreview(null);setImportMsg(null);}} style={{...btnL,marginTop:10,color:"#bbb",background:"none"}}>Cancel</button>
      </Sheet>}

      {showReport&&<Sheet onClose={()=>setShowReport(false)}><CreditReport accounts={accounts} expenses={expenses} onClose={()=>setShowReport(false)}/></Sheet>}

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#fff",borderTop:"1px solid #f0f0f0",display:"flex",padding:"10px 0 20px"}}>
        {[["overview","◎"],["accounts","▣"],["expenses","↓"],["insights","◈"]].map(([t,icon])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,color:tab===t?"#1a1a1a":"#ccc",fontFamily:"inherit"}}>
            <span style={{fontSize:18}}>{icon}</span>
            <span style={{fontSize:10,fontWeight:tab===t?600:400,textTransform:"capitalize",letterSpacing:"0.05em"}}>{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
