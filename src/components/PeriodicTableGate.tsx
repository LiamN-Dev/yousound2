import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Atom, FlaskConical, X } from 'lucide-react';

type Family = 'alkali metal' | 'alkaline earth metal' | 'transition metal' | 'post-transition metal' | 'metalloid' | 'reactive nonmetal' | 'noble gas' | 'lanthanide' | 'actinide' | 'unknown';
type Element = { n: number; s: string; name: string; mass: string; family: Family; group: number; period: number; row: number };

const raw: Array<[number,string,string,string,Family,number,number,number]> = [
[1,'H','Hydrogen','1.008','reactive nonmetal',1,1,1],[2,'He','Helium','4.0026','noble gas',18,1,1],
[3,'Li','Lithium','6.94','alkali metal',1,2,2],[4,'Be','Beryllium','9.0122','alkaline earth metal',2,2,2],[5,'B','Boron','10.81','metalloid',13,2,2],[6,'C','Carbon','12.011','reactive nonmetal',14,2,2],[7,'N','Nitrogen','14.007','reactive nonmetal',15,2,2],[8,'O','Oxygen','15.999','reactive nonmetal',16,2,2],[9,'F','Fluorine','18.998','reactive nonmetal',17,2,2],[10,'Ne','Neon','20.180','noble gas',18,2,2],
[11,'Na','Sodium','22.990','alkali metal',1,3,3],[12,'Mg','Magnesium','24.305','alkaline earth metal',2,3,3],[13,'Al','Aluminium','26.982','post-transition metal',13,3,3],[14,'Si','Silicon','28.085','metalloid',14,3,3],[15,'P','Phosphorus','30.974','reactive nonmetal',15,3,3],[16,'S','Sulfur','32.06','reactive nonmetal',16,3,3],[17,'Cl','Chlorine','35.45','reactive nonmetal',17,3,3],[18,'Ar','Argon','39.948','noble gas',18,3,3],
[19,'K','Potassium','39.098','alkali metal',1,4,4],[20,'Ca','Calcium','40.078','alkaline earth metal',2,4,4],[21,'Sc','Scandium','44.956','transition metal',3,4,4],[22,'Ti','Titanium','47.867','transition metal',4,4,4],[23,'V','Vanadium','50.942','transition metal',5,4,4],[24,'Cr','Chromium','51.996','transition metal',6,4,4],[25,'Mn','Manganese','54.938','transition metal',7,4,4],[26,'Fe','Iron','55.845','transition metal',8,4,4],[27,'Co','Cobalt','58.933','transition metal',9,4,4],[28,'Ni','Nickel','58.693','transition metal',10,4,4],[29,'Cu','Copper','63.546','transition metal',11,4,4],[30,'Zn','Zinc','65.38','transition metal',12,4,4],[31,'Ga','Gallium','69.723','post-transition metal',13,4,4],[32,'Ge','Germanium','72.630','metalloid',14,4,4],[33,'As','Arsenic','74.922','metalloid',15,4,4],[34,'Se','Selenium','78.971','reactive nonmetal',16,4,4],[35,'Br','Bromine','79.904','reactive nonmetal',17,4,4],[36,'Kr','Krypton','83.798','noble gas',18,4,4],
[37,'Rb','Rubidium','85.468','alkali metal',1,5,5],[38,'Sr','Strontium','87.62','alkaline earth metal',2,5,5],[39,'Y','Yttrium','88.906','transition metal',3,5,5],[40,'Zr','Zirconium','91.224','transition metal',4,5,5],[41,'Nb','Niobium','92.906','transition metal',5,5,5],[42,'Mo','Molybdenum','95.95','transition metal',6,5,5],[43,'Tc','Technetium','98','transition metal',7,5,5],[44,'Ru','Ruthenium','101.07','transition metal',8,5,5],[45,'Rh','Rhodium','102.906','transition metal',9,5,5],[46,'Pd','Palladium','106.42','transition metal',10,5,5],[47,'Ag','Silver','107.868','transition metal',11,5,5],[48,'Cd','Cadmium','112.414','transition metal',12,5,5],[49,'In','Indium','114.818','post-transition metal',13,5,5],[50,'Sn','Tin','118.710','post-transition metal',14,5,5],[51,'Sb','Antimony','121.760','metalloid',15,5,5],[52,'Te','Tellurium','127.60','metalloid',16,5,5],[53,'I','Iodine','126.904','reactive nonmetal',17,5,5],[54,'Xe','Xenon','131.293','noble gas',18,5,5],
[55,'Cs','Caesium','132.905','alkali metal',1,6,6],[56,'Ba','Barium','137.327','alkaline earth metal',2,6,6],[57,'La','Lanthanum','138.905','lanthanide',3,6,6],[58,'Ce','Cerium','140.116','lanthanide',4,6,8],[59,'Pr','Praseodymium','140.908','lanthanide',5,6,8],[60,'Nd','Neodymium','144.242','lanthanide',6,6,8],[61,'Pm','Promethium','145','lanthanide',7,6,8],[62,'Sm','Samarium','150.36','lanthanide',8,6,8],[63,'Eu','Europium','151.964','lanthanide',9,6,8],[64,'Gd','Gadolinium','157.25','lanthanide',10,6,8],[65,'Tb','Terbium','158.925','lanthanide',11,6,8],[66,'Dy','Dysprosium','162.500','lanthanide',12,6,8],[67,'Ho','Holmium','164.930','lanthanide',13,6,8],[68,'Er','Erbium','167.259','lanthanide',14,6,8],[69,'Tm','Thulium','168.934','lanthanide',15,6,8],[70,'Yb','Ytterbium','173.045','lanthanide',16,6,8],[71,'Lu','Lutetium','174.967','lanthanide',17,6,8],
[72,'Hf','Hafnium','178.49','transition metal',4,6,6],[73,'Ta','Tantalum','180.948','transition metal',5,6,6],[74,'W','Tungsten','183.84','transition metal',6,6,6],[75,'Re','Rhenium','186.207','transition metal',7,6,6],[76,'Os','Osmium','190.23','transition metal',8,6,6],[77,'Ir','Iridium','192.217','transition metal',9,6,6],[78,'Pt','Platinum','195.084','transition metal',10,6,6],[79,'Au','Gold','196.967','transition metal',11,6,6],[80,'Hg','Mercury','200.592','transition metal',12,6,6],[81,'Tl','Thallium','204.38','post-transition metal',13,6,6],[82,'Pb','Lead','207.2','post-transition metal',14,6,6],[83,'Bi','Bismuth','208.980','post-transition metal',15,6,6],[84,'Po','Polonium','209','post-transition metal',16,6,6],[85,'At','Astatine','210','unknown',17,6,6],[86,'Rn','Radon','222','noble gas',18,6,6],
[87,'Fr','Francium','223','alkali metal',1,7,7],[88,'Ra','Radium','226','alkaline earth metal',2,7,7],[89,'Ac','Actinium','227','actinide',3,7,7],[90,'Th','Thorium','232.038','actinide',4,7,9],[91,'Pa','Protactinium','231.036','actinide',5,7,9],[92,'U','Uranium','238.029','actinide',6,7,9],[93,'Np','Neptunium','237','actinide',7,7,9],[94,'Pu','Plutonium','244','actinide',8,7,9],[95,'Am','Americium','243','actinide',9,7,9],[96,'Cm','Curium','247','actinide',10,7,9],[97,'Bk','Berkelium','247','actinide',11,7,9],[98,'Cf','Californium','251','actinide',12,7,9],[99,'Es','Einsteinium','252','actinide',13,7,9],[100,'Fm','Fermium','257','actinide',14,7,9],[101,'Md','Mendelevium','258','actinide',15,7,9],[102,'No','Nobelium','259','actinide',16,7,9],[103,'Lr','Lawrencium','266','actinide',17,7,9],
[104,'Rf','Rutherfordium','267','unknown',4,7,7],[105,'Db','Dubnium','268','unknown',5,7,7],[106,'Sg','Seaborgium','269','unknown',6,7,7],[107,'Bh','Bohrium','270','unknown',7,7,7],[108,'Hs','Hassium','277','unknown',8,7,7],[109,'Mt','Meitnerium','278','unknown',9,7,7],[110,'Ds','Darmstadtium','281','unknown',10,7,7],[111,'Rg','Roentgenium','282','unknown',11,7,7],[112,'Cn','Copernicium','285','unknown',12,7,7],[113,'Nh','Nihonium','286','unknown',13,7,7],[114,'Fl','Flerovium','289','unknown',14,7,7],[115,'Mc','Moscovium','290','unknown',15,7,7],[116,'Lv','Livermorium','293','unknown',16,7,7],[117,'Ts','Tennessine','294','unknown',17,7,7],[118,'Og','Oganesson','294','unknown',18,7,7]
];
const elements: Element[] = raw.map(([n,s,name,mass,family,group,period,row]) => ({ n,s,name,mass,family,group,period,row }));

const familyStyle: Record<Family,string> = {
  'alkali metal':'border-rose-300/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20',
  'alkaline earth metal':'border-orange-300/30 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20',
  'transition metal':'border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20',
  'post-transition metal':'border-sky-300/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20',
  metalloid:'border-lime-300/30 bg-lime-500/10 text-lime-100 hover:bg-lime-500/20',
  'reactive nonmetal':'border-emerald-300/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20',
  'noble gas':'border-violet-300/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20',
  lanthanide:'border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-100 hover:bg-fuchsia-500/20',
  actinide:'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20',
  unknown:'border-slate-300/25 bg-slate-500/10 text-slate-200 hover:bg-slate-500/20'
};
const gases = new Set([1,2,7,8,9,10,17,18,36,54,86]);
const liquids = new Set([35,80]);
const phase = (n:number) => liquids.has(n) ? 'Liquid' : gases.has(n) ? 'Gas' : n >= 109 ? 'Not established' : 'Solid';
const description = (e:Element) => e.n === 80
  ? 'Mercury is a dense, silvery transition metal and the only metal that is liquid at standard room temperature. It forms droplets and conducts electricity. Mercury and many of its compounds are toxic, so exposure must be avoided.'
  : e.name + ' is a ' + e.family + ' in period ' + e.period + ', group ' + e.group + '. Its atomic structure gives it a characteristic set of physical and chemical properties.';
const uses = (e:Element) => {
  const known:Record<number,string> = {
    6:'Carbon is central to organic chemistry and is used in steel, electrodes, filters, and many industrial materials.',
    14:'Silicon is essential in computer chips, solar cells, glass, and construction materials.',
    26:'Iron is used in steel for buildings, vehicles, tools, and machinery.',
    29:'Copper is widely used in electrical wiring, plumbing, electronics, and heat exchangers.',
    79:'Gold is used in jewelry, electronics, dentistry, and corrosion-resistant contacts.',
    80:'Mercury was historically used in thermometers, barometers, fluorescent lamps, and industrial processes. Many uses have been reduced because mercury is toxic.'
  };
  return known[e.n] || 'Its applications depend on its physical and chemical properties. Uses may include research, materials science, manufacturing, or specialized technology.';
};
const categories = Object.keys(familyStyle) as Family[];

export const PeriodicTableGate: React.FC<{ onEnterYouSound: () => void }> = ({ onEnterYouSound }) => {
  const [selected,setSelected] = useState<Element|null>(null);
  const [hTaps,setHTaps] = useState(0);
  const close = () => { setSelected(null); setHTaps(0); };
  const open = (e:Element) => { setSelected(e); setHTaps(0); };
  const tapH = () => {
    const next = hTaps + 1;
    setHTaps(next);
    if (next >= 5) onEnterYouSound();
  };

  return <div className="min-h-screen overflow-x-hidden bg-[#07111f] text-slate-100">
    <div className="pointer-events-none fixed inset-0 opacity-70" style={{background:'radial-gradient(circle at 18% 8%,rgba(14,165,233,.13),transparent 32rem),radial-gradient(circle at 85% 90%,rgba(139,92,246,.12),transparent 34rem)'}} />
    <div className="relative mx-auto flex min-h-screen max-w-[1720px] flex-col px-4 py-6 sm:px-7 lg:px-10">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200"><Atom size={23}/></div>
          <div><div className="text-[10px] font-bold uppercase tracking-[.28em] text-cyan-300/75">Learn AI Studio</div><h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Interactive Periodic Table</h1></div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400"/>{elements.length} elements · Reference guide</div>
      </header>

      <section className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><div className="mb-1 text-[10px] font-semibold uppercase tracking-[.24em] text-slate-500">The elements</div><h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Explore the building blocks of matter.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Select any element to view its atomic number, relative atomic mass, family, and physical state.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-slate-400"><FlaskConical size={15} className="text-cyan-300"/>Chemistry reference</div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#0b1929]/80 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-5">
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-400">
          {categories.map(c=><span key={c} className="flex items-center gap-1.5 capitalize"><span className={'h-2 w-2 rounded-sm border '+familyStyle[c].split(' ')[0]}/>{c}</span>)}
        </div>
        <div className="overflow-x-auto pb-3">
          <div className="min-w-[1040px]">
            <div className="mb-1 grid grid-cols-[repeat(18,minmax(0,1fr))] gap-1.5 px-0.5">{Array.from({length:18},(_,i)=><div key={i} className="text-center text-[9px] font-semibold text-slate-600">{i+1}</div>)}</div>
            <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] grid-rows-[repeat(9,minmax(64px,auto))] gap-1.5">
              <div className="flex items-center justify-center rounded-xl border border-fuchsia-300/15 bg-fuchsia-500/[.045] text-center text-[9px] font-semibold uppercase tracking-wider text-fuchsia-200/70" style={{gridColumn:'1 / span 3',gridRow:8}}>Lanthanides</div>
              <div className="flex items-center justify-center rounded-xl border border-amber-300/15 bg-amber-500/[.045] text-center text-[9px] font-semibold uppercase tracking-wider text-amber-200/70" style={{gridColumn:'1 / span 3',gridRow:9}}>Actinides</div>
              {elements.map(e=><button key={e.n} type="button" onClick={()=>open(e)} style={{gridColumn:e.group,gridRow:e.row}} className={'group relative flex min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center transition duration-150 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 '+familyStyle[e.family]} title={e.name+' · '+e.n}>
                <span className="absolute left-1 top-1 text-[8px] leading-none opacity-75">{e.n}</span><span className="mt-1 text-base font-bold leading-tight sm:text-lg">{e.s}</span><span className="mt-0.5 max-w-full truncate text-[8px] leading-tight sm:text-[9px]">{e.name}</span><span className="mt-0.5 hidden text-[8px] opacity-65 xl:block">{e.mass}</span>
              </button>)}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-white/[.06] pt-3 text-[10px] text-slate-500"><span>Groups 1–18 · Periods 1–7</span><span>Scroll horizontally on smaller screens</span></div>
      </section>
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6 text-[10px] text-slate-600"><span>Learn AI Studio · Chemistry Reference</span><span>Atomic masses are rounded reference values.</span></footer>
    </div>

    <AnimatePresence>
      {selected && <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020711]/80 p-4 backdrop-blur-md" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={close}>
        <motion.section role="dialog" aria-modal="true" aria-label={selected.name+' element details'} initial={{opacity:0,scale:.9,y:22}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.96,y:12}} transition={{type:'spring',stiffness:260,damping:25}} onClick={event=>event.stopPropagation()} className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1929] p-5 text-white shadow-2xl shadow-black/50 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl"/>
          <button type="button" onClick={close} aria-label="Close element details" className="absolute right-4 top-4 z-10 rounded-xl border border-white/10 bg-white/[.06] p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={17}/></button>
          <div className="relative flex flex-col gap-6 sm:flex-row">
            <div className={'flex h-36 w-36 shrink-0 flex-col items-center justify-center rounded-3xl border '+familyStyle[selected.family]}>
              <span className="self-start pl-4 text-sm opacity-75">{selected.n}</span>
              {selected.n===80 ? <div className="flex items-center text-5xl font-semibold leading-none"><button type="button" onClick={tapH} aria-label="Mercury symbol H" className="rounded-md px-0.5 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">H</button><span>g</span></div> : <span className="text-5xl font-semibold leading-none">{selected.s}</span>}
              <span className="mt-2 text-xs font-medium opacity-80">{selected.name}</span>
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="text-[10px] font-bold uppercase tracking-[.24em] text-cyan-300/75">Element profile</div><h2 className="mt-2 text-3xl font-semibold tracking-tight">{selected.name}</h2><p className="mt-3 text-sm leading-6 text-slate-300">{description(selected)}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3"><div className="text-[9px] uppercase tracking-wider text-slate-500">Atomic number</div><div className="mt-1 text-xl font-semibold tabular-nums">{selected.n}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3"><div className="text-[9px] uppercase tracking-wider text-slate-500">Atomic mass</div><div className="mt-1 text-xl font-semibold tabular-nums">{selected.mass}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3"><div className="text-[9px] uppercase tracking-wider text-slate-500">Family</div><div className="mt-1 text-sm font-semibold capitalize">{selected.family}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3"><div className="text-[9px] uppercase tracking-wider text-slate-500">State at room temperature</div><div className="mt-1 text-sm font-semibold">{phase(selected.n)}</div></div>
              </div>
            </div>
          </div>
          <div className="relative mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-cyan-100"><FlaskConical size={14} className="text-cyan-300"/>Common uses and context</div><p className="mt-2 text-xs leading-5 text-slate-400">{uses(selected)}</p><div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500"><span>Period {selected.period}</span><span>·</span><span>Group {selected.group}</span></div></div>
        </motion.section>
      </motion.div>}
    </AnimatePresence>
  </div>;
};
