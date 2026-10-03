import { createFileRoute } from "@tanstack/react-router";
import { useEffect,useMemo,useState,type FormEvent } from "react";
import {
  ArrowRight,Boxes,BrainCircuit,Check,ChefHat,MapPin,MonitorSmartphone,
  PackageCheck,Search,ShieldCheck,Sparkles,Truck
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { seo } from "@/lib/seo";

export const Route=createFileRoute("/franchise")({
  head:()=>seo({
    title:"MealDeck Franchise — Run 15+ Brands From One Kitchen",
    description:"Explore MealDeck franchise territories across England and Wales. 15+ brands, Dishbee + Omniqora technology, central marketing, training, support and supply.",
    path:"/franchise",
    keywords:"MealDeck franchise, cloud kitchen franchise UK, dark kitchen franchise, food franchise UK, multi brand food franchise, takeaway franchise"
  }),
  component:FranchisePage
});

type Territory={code:string;name:string;region:string;status:string;fee:number;currency:string;isSellable:boolean;note?:string|null;score?:number|null};
type Programme={key:string;name:string;currency:string;feeMin:number;feeMax:number;royaltyPercent:number;marketingPercent:number;techFeePerOrder:number;supplyMarkupPercent:number;managedFranchiseAvailable?:boolean;managedProfitSharePercent?:number;managedProfitBasis?:string;offer?:any};
type ApiData={programme:Programme;territories:Territory[]};

const fallbackMarkets=[
  {name:"Luton",status:"coming_soon"},
  {name:"St Albans",status:"coming_soon"},
  {name:"Bedford",status:"taken"},
  {name:"Milton Keynes",status:"taken"},
  {name:"Islington / Camden",status:"taken",note:"Caledonian Road area"}
];

const fallbackAvailable:Territory[]=[
  {code:"MD-002",name:"Elephant & Castle / Bermondsey / Southwark",region:"London",fee:25000,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-003",name:"Battersea / Clapham / Vauxhall",region:"London",fee:25000,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-004",name:"Leyton / Stratford",region:"London",fee:22500,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-005",name:"Lewisham / Deptford / Greenwich West",region:"London",fee:22500,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-006",name:"Alperton / Wembley / Park Royal",region:"London",fee:22500,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-007",name:"Southall / Hayes",region:"London",fee:20000,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-008",name:"Edmonton / Tottenham / Enfield South",region:"London",fee:20000,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-009",name:"Barking / Ilford",region:"London",fee:20000,status:"available",currency:"GBP",isSellable:true},
  {code:"MD-010",name:"Thornton Heath / Croydon",region:"London",fee:20000,status:"available",currency:"GBP",isSellable:true},
];

const whatWeProvide=[
  {icon:Boxes,title:"15+ brands and growing",copy:"A growing portfolio of MealDeck food and beverage concepts from one kitchen."},
  {icon:MonitorSmartphone,title:"Dishbee + Omniqora",copy:"Ordering, KDS, CRM, geofencing, intelligence, analytics, automation and franchise operations."},
  {icon:Truck,title:"Delivery orchestration",copy:"Direct-delivery and courier integrations where commercially available, including the providers configured for each market."},
  {icon:Sparkles,title:"Marketing engine",copy:"National creative, local geo campaigns, SEO, paid media, CRM, social and launch marketing."},
  {icon:ChefHat,title:"Training & operating system",copy:"Recipes, brand standards, SOPs, onboarding, launch training and ongoing operational support."},
  {icon:PackageCheck,title:"Central production & supply",copy:"Brand-critical food products and packaging supplied through the MealDeck network."},
  {icon:BrainCircuit,title:"Intelligence & admin",copy:"Performance reporting, territory intelligence, customer insights, franchise administration and support."},
  {icon:ShieldCheck,title:"Protected territory",copy:"Defined core territory with controlled overlap and data-led expansion rules."},
];

const operatorFunds=[
  "Initial franchise fee for the territory",
  "Kitchen rent, deposit, rates/service charges and utilities",
  "Staff recruitment, payroll and day-to-day kitchen management",
  "Food, packaging and opening/ongoing stock",
  "Any equipment missing from the approved kitchen",
  "KDS screen and printer where required",
  "Insurance, licences, local operating expenses and working capital",
];

function statusText(value:string){
  return value==="coming_soon"?"Coming soon":value==="taken"?"Taken":value==="available"?"Available":value.replaceAll("_"," ");
}
function money(n:number){return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(n);}
function techFee(n:number){return Math.round(n*100)+"p";}

function FranchisePage(){
  const[data,setData]=useState<ApiData|null>(null),[loadError,setLoadError]=useState(""),[query,setQuery]=useState("");
  const[selected,setSelected]=useState<Territory|null>(null),[submitted,setSubmitted]=useState(false),[sending,setSending]=useState(false),[formError,setFormError]=useState("");
  const[form,setForm]=useState({name:"",email:"",phone:"",area:"",operatorModel:"owner_operator" as "owner_operator"|"managed_investor"|"multi_unit_operator",existingKitchen:false,existingBusiness:"",capital:"",launchTiming:"",multiUnit:false,consent:false,website:""});

  useEffect(()=>{
    fetch("/api/franchise?programme=mealdeck-england-wales")
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||"Unavailable");setData(j);})
      .catch(()=>setLoadError("Live territory search is temporarily unavailable. You can still register your interest below."));
  },[]);

  const programme=data?.programme??{
    key:"mealdeck-england-wales",name:"MealDeck England & Wales",currency:"GBP",feeMin:7500,feeMax:25000,
    royaltyPercent:5.5,marketingPercent:1.5,techFeePerOrder:.25,supplyMarkupPercent:10,managedFranchiseAvailable:true,managedProfitSharePercent:20,managedProfitBasis:"managed_operating_profit",offer:{featuredMarkets:fallbackMarkets}
  };
  const markets=programme.offer?.featuredMarkets?.length?programme.offer.featuredMarkets:fallbackMarkets;
  const availableLondon=(data?.territories??[]).filter(t=>t.region==="London"&&t.status==="available"&&t.isSellable);
  const londonCards=availableLondon.length?availableLondon:fallbackAvailable;
  const matches=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return [];
    return (data?.territories??[]).filter(t=>t.name.toLowerCase().includes(q)||t.region.toLowerCase().includes(q)||t.code.toLowerCase().includes(q)).slice(0,14);
  },[data,query]);

  function choose(t:Territory){
    if(t.status!=="available"||!t.isSellable)return;
    setSelected(t);setForm(v=>({...v,area:t.name}));
    document.getElementById("apply")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function submit(e:FormEvent){
    e.preventDefault();setFormError("");
    if(!form.consent){setFormError("Please confirm that MealDeck may contact you about this franchise enquiry.");return;}
    setSending(true);
    try{
      const params=new URLSearchParams(window.location.search);const utm:Record<string,string>={};
      ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach(k=>{const v=params.get(k);if(v)utm[k]=v;});
      const r=await fetch("/api/franchise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        programmeKey:"mealdeck-england-wales",territoryCode:selected?.code??null,name:form.name,email:form.email,phone:form.phone||null,
        preferredArea:form.area,existingKitchen:form.existingKitchen,existingBusiness:form.existingBusiness||null,
        availableCapitalMinor:form.capital?Math.round(Number(form.capital)*100):null,launchTiming:form.launchTiming||null,
        multiUnitInterest:form.multiUnit,operatorModel:form.operatorModel,source:"mealdeck-franchise-page",utm,answers:{selectedTerritory:selected?.name??null},
        consent:true,website:form.website
      })});
      const j=await r.json();if(!r.ok)throw new Error(j.error||"Application could not be submitted.");
      setSubmitted(true);
    }catch(error){setFormError(error instanceof Error?error.message:"Application could not be submitted.");}
    finally{setSending(false);}
  }

  return <div className="md-marketing-shell">
    <SiteHeader context={<a href="#apply" className="md-btn md-btn-yellow">Apply now <ArrowRight/></a>}/>
    <main>
      <section className="md-franchise-hero">
        <div className="md-franchise-hero-grid">
          <div>
            <p className="md-kicker">MealDeck franchise</p>
            <h1>15+ brands.<br/><span>One kitchen.</span></h1>
            <p className="md-franchise-hero-lead">Run a growing portfolio of delivery-first food and beverage brands from one approved kitchen, powered by Dishbee and Omniqora.</p>
            <div className="md-franchise-hero-actions">
              <a href="#territories" className="md-btn md-btn-yellow">Check a territory <ArrowRight/></a>
              <a href="#model" className="md-btn md-btn-outline-light">See the model</a>
            </div>
            <div className="md-franchise-proof">
              <span><Check/> Protected territory</span>
              <span><Check/> From {money(programme.feeMin)}</span>
              <span><Check/> Central marketing & support</span>
            </div>
          </div>
          <div className="md-franchise-stack" aria-label="MealDeck franchise model">
            <div className="md-franchise-card md-franchise-card-a"><span>15+</span><b>BRANDS</b><small>and growing</small></div>
            <div className="md-franchise-card md-franchise-card-b"><span>1</span><b>KITCHEN</b><small>shared operations</small></div>
            <div className="md-franchise-card md-franchise-card-c"><span>1</span><b>TECH STACK</b><small>Dishbee + Omniqora</small></div>
          </div>
        </div>
      </section>

      <section className="md-franchise-stat-strip">
        <div><strong>{money(programme.feeMin)}–{money(programme.feeMax)}</strong><span>initial territory fee</span></div>
        <div><strong>{programme.royaltyPercent}%</strong><span>royalty on net sales</span></div>
        <div><strong>{programme.marketingPercent}%</strong><span>marketing contribution</span></div>
        <div><strong>{techFee(programme.techFeePerOrder)}</strong><span>technology per completed order</span></div>
        <div><strong>Cost + {programme.supplyMarkupPercent}%</strong><span>central supplied goods</span></div>
      </section>

      <section id="model" className="md-section md-section-cream">
        <div className="md-section-heading">
          <p className="md-kicker md-kicker-red">What MealDeck provides</p>
          <h2>You run the kitchen. We run the system around it.</h2>
          <p>MealDeck provides the brands and franchise framework. Dishbee runs hospitality operations. Omniqora provides shared control, intelligence, CRM, growth, territory and franchise-sales capabilities.</p>
        </div>
        <div className="md-franchise-benefit-grid">
          {whatWeProvide.map(({icon:Icon,title,copy})=><article key={title}><Icon/><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="md-franchise-split">
        <article className="md-franchise-split-dark">
          <p className="md-kicker">Designed for fitted kitchens</p>
          <h2>Low additional setup where the kitchen already works.</h2>
          <p>A suitable cloud kitchen may already have extraction, fryers, refrigeration, prep and wash facilities. The operator funds only the equipment and working capital actually needed for the approved MealDeck setup.</p>
        </article>
        <article className="md-franchise-split-paper">
          <p className="md-kicker md-kicker-red">The operator funds</p>
          <ul>{operatorFunds.map(x=><li key={x}><Check/>{x}</li>)}</ul>
        </article>
      </section>

      <section className="md-section md-section-cream">
        <div className="md-section-heading">
          <p className="md-kicker md-kicker-red">Two ways to own a MealDeck franchise</p>
          <h2>Operate it yourself — or invest and let an approved MealDeck operations company manage it.</h2>
          <p>The franchise economics stay separate from the management arrangement. A managed investor still funds the franchise, premises, staff, utilities, supplies and working capital; the operations company runs the day-to-day kitchen under a separate management agreement.</p>
        </div>
        <div className="md-franchise-model-grid">
          <article>
            <span>01</span><h3>Owner-operator franchise</h3>
            <p>You or your team manage the kitchen directly. MealDeck provides the brands, technology, marketing, training, admin, oversight and supply system.</p>
            <strong>Standard franchise fees apply.</strong>
          </article>
          <article>
            <span>02</span><h3>Managed investor franchise</h3>
            <p>You fund and own the franchise opportunity, while a separately contracted MealDeck operations company manages staffing, shifts, kitchen performance and day-to-day operations.</p>
            <strong>Indicative management share: {programme.managedProfitSharePercent??20}% of Managed Operating Profit.</strong>
          </article>
        </div>
        <p className="md-franchise-model-note">Managed Operating Profit is calculated after the site's operating costs and standard franchise charges, but before the management fee, finance costs, corporation tax, depreciation and investor distributions. Final terms are set out in a separate management agreement.</p>
      </section>

      <section className="md-section md-section-black">
        <div className="md-section-heading md-section-heading-light">
          <p className="md-kicker">First rollout markets</p>
          <h2>Some hands are already dealt.</h2>
          <p>We show prospects only the public territory status. Internal ownership arrangements are not displayed.</p>
        </div>
        <div className="md-franchise-market-grid">
          {markets.map((m:any)=><article key={m.name} className={"md-franchise-market "+(m.status==="taken"?"is-taken":m.status==="coming_soon"?"is-soon":"is-open")}>
            <MapPin/><div><h3>{m.name}</h3><strong>{statusText(m.status)}</strong>{m.note&&<p>{m.note}</p>}</div>
          </article>)}
        </div>
      </section>

      <section id="territories" className="md-section md-section-cream">
        <div className="md-section-heading">
          <p className="md-kicker md-kicker-red">London opportunities</p>
          <h2>Available London territories.</h2>
          <p>Islington / Camden around Caledonian Road is taken. These London territories remain part of the franchise opportunity, subject to final availability.</p>
        </div>
        <div className="md-franchise-territory-grid">
          {londonCards.map((t:any)=><button key={t.code??t.name} type="button" onClick={()=>choose(t as Territory)} className="md-franchise-territory-card">
            <span>London</span><h3>{t.name}</h3><p>Indicative fee</p><strong>{money(t.fee)}</strong><em>Available</em>
          </button>)}
        </div>

        <div className="md-franchise-search">
          <div><p className="md-kicker md-kicker-red">England & Wales</p><h2>Search the national network.</h2><p>Search by town, city, region or territory code. Live availability is controlled by Omniqora Franchise Sales.</p></div>
          <label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. Manchester, Cardiff, Bristol…"/></label>
          {loadError&&<p className="md-franchise-search-note">{loadError}</p>}
          {!!query&&<div className="md-franchise-search-results">
            {matches.map(t=><button key={t.code} type="button" disabled={t.status!=="available"||!t.isSellable} onClick={()=>choose(t)}>
              <div><b>{t.name}</b><span>{t.region} · {t.code}</span></div>
              <div><strong>{statusText(t.status)}</strong><span>{t.status==="available"&&t.isSellable?money(t.fee):""}</span></div>
            </button>)}
            {data&&matches.length===0&&<p>No matching territory found. You can still register interest in the form below.</p>}
          </div>}
        </div>
      </section>

      <section className="md-section md-section-black">
        <div className="md-section-heading md-section-heading-light"><p className="md-kicker">How launch works</p><h2>From territory to trading kitchen.</h2></div>
        <div className="md-franchise-step-grid">
          {[
            ["01","Choose territory","Check availability and submit your application."],
            ["02","Qualify & approve","We assess operator fit, territory and kitchen/site."],
            ["03","Agreement & setup","Complete documents, fee, kitchen gap-check and supply setup."],
            ["04","Train & configure","Brands, recipes, Dishbee, Omniqora, KDS and delivery channels are configured."],
            ["05","Launch marketing","MealDeck runs launch creative, local geo campaigns, CRM and digital acquisition."],
            ["06","Operate & grow","You run the kitchen; we provide oversight, tech, marketing, admin and supply support."],
          ].map(([n,title,copy])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section id="apply" className="md-section md-section-cream">
        <div className="md-franchise-apply-grid">
          <div>
            <p className="md-kicker md-kicker-red">Apply for MealDeck</p>
            <h2>{selected?"Apply for "+selected.name:"Tell us where you want to operate."}</h2>
            <p>Your application is sent into Omniqora Franchise Sales, where territory availability, qualification, documents, training and launch are managed.</p>
            <div className="md-franchise-fee-box">
              <span>Franchise fee</span><strong>{selected?money(selected.fee):money(programme.feeMin)+"–"+money(programme.feeMax)}</strong>
              <small>Plus ongoing {programme.royaltyPercent}% royalty, {programme.marketingPercent}% marketing, {techFee(programme.techFeePerOrder)} per completed order technology fee and central supplies at fully loaded delivered cost + {programme.supplyMarkupPercent}%.</small>
            </div>
          </div>

          {submitted?<div className="md-franchise-success"><Sparkles/><h3>Application received.</h3><p>Your enquiry has entered the MealDeck franchise pipeline. The team can now review the territory and contact you.</p></div>:
          <form className="md-franchise-form" onSubmit={submit}>
            <input tabIndex={-1} autoComplete="off" className="md-franchise-honeypot" value={form.website} onChange={e=>setForm(v=>({...v,website:e.target.value}))} aria-hidden="true"/>
            <label><span>Name</span><input required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label>
            <div className="md-franchise-form-pair">
              <label><span>Email</span><input required type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></label>
              <label><span>Phone</span><input value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></label>
            </div>
            <label><span>Preferred town / territory</span><input required value={form.area} onChange={e=>{setSelected(null);setForm(v=>({...v,area:e.target.value}));}} placeholder="e.g. Leeds, Croydon, Bristol"/></label>
            <label><span>How do you want to operate?</span><select value={form.operatorModel} onChange={e=>setForm(v=>({...v,operatorModel:e.target.value as any}))}><option value="owner_operator">Owner-operator franchise</option><option value="managed_investor">Managed investor franchise</option><option value="multi_unit_operator">Multi-unit operator</option></select></label>
            <label><span>Existing food business / kitchen (optional)</span><input value={form.existingBusiness} onChange={e=>setForm(v=>({...v,existingBusiness:e.target.value}))} placeholder="Business or kitchen name"/></label>
            <div className="md-franchise-form-pair">
              <label><span>Available investment / working capital £</span><input type="number" min="0" value={form.capital} onChange={e=>setForm(v=>({...v,capital:e.target.value}))}/></label>
              <label><span>Target launch timing</span><select value={form.launchTiming} onChange={e=>setForm(v=>({...v,launchTiming:e.target.value}))}><option value="">Select</option><option>Immediately / 0–3 months</option><option>3–6 months</option><option>6–12 months</option><option>12+ months</option></select></label>
            </div>
            <label className="md-franchise-check"><input type="checkbox" checked={form.existingKitchen} onChange={e=>setForm(v=>({...v,existingKitchen:e.target.checked}))}/><span>I already have access to a fitted commercial/cloud kitchen.</span></label>
            <label className="md-franchise-check"><input type="checkbox" checked={form.multiUnit} onChange={e=>setForm(v=>({...v,multiUnit:e.target.checked}))}/><span>I am interested in multiple territories.</span></label>
            <label className="md-franchise-check"><input type="checkbox" required checked={form.consent} onChange={e=>setForm(v=>({...v,consent:e.target.checked}))}/><span>MealDeck may contact me about this franchise enquiry.</span></label>
            {formError&&<p className="md-franchise-form-error">{formError}</p>}
            <button className="md-btn md-btn-red" disabled={sending}>{sending?"Sending…":"Submit franchise enquiry"} {!sending&&<ArrowRight/>}</button>
            <p className="md-franchise-form-small">Submitting an enquiry does not reserve a territory or guarantee approval. Fees and territory details are confirmed before agreement.</p>
          </form>}
        </div>
      </section>
    </main>
    <SiteFooter/>
  </div>;
}
