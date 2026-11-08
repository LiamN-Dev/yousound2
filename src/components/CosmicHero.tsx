import React from 'react';
import { ArrowDown, Headphones, Activity, Sparkles } from 'lucide-react';

type CosmicHeroProps = {
  onExploreLibrary: () => void;
  onOpenRadio: () => void;
};

export const CosmicHero: React.FC<CosmicHeroProps> = ({ onExploreLibrary, onOpenRadio }) => (
  <section className="ys-cosmic-hero" aria-labelledby="ys-cosmic-title">
    <div className="ys-cosmic-grid-glow" aria-hidden="true" />
    <div className="ys-cosmic-corner ys-cosmic-corner-tl" aria-hidden="true" />
    <div className="ys-cosmic-corner ys-cosmic-corner-br" aria-hidden="true" />
    <div className="ys-cosmic-topline">
      <span><span className="ys-cosmic-status-dot" /> YOUSOUND NETWORK <span className="ys-cosmic-topline-separator">/</span> AUDIO DIVISION</span>
      <span className="ys-cosmic-transmission"><Activity size={12} /> TRANSMISSION ACTIVE</span>
    </div>
    <div className="ys-cosmic-layout">
      <div className="ys-cosmic-copy">
        <div className="ys-cosmic-eyebrow"><Sparkles size={13} /> YOUR FREQUENCY. YOUR UNIVERSE.</div>
        <p className="ys-cosmic-index">SIGNAL 001 <span>—</span> THE LISTENING EXPERIENCE</p>
        <h1 id="ys-cosmic-title" className="ys-cosmic-title">Sound,<br /><span>unbound.</span></h1>
        <p className="ys-cosmic-description">Discover the next track, build your own atmosphere, and tune in to a world built around sound.</p>
        <div className="ys-cosmic-actions">
          <button type="button" className="ys-cosmic-primary" onClick={onExploreLibrary}>EXPLORE THE LIBRARY <ArrowDown size={15} /></button>
          <button type="button" className="ys-cosmic-secondary" onClick={onOpenRadio}><Headphones size={15} /> ENTER LIVE RADIO</button>
        </div>
        <div className="ys-cosmic-stats" aria-label="YouSound features">
          <div><span className="ys-cosmic-stat-number">01</span><span className="ys-cosmic-stat-label">THE LIBRARY</span></div>
          <div><span className="ys-cosmic-stat-number">02</span><span className="ys-cosmic-stat-label">LIVE RADIO</span></div>
          <div><span className="ys-cosmic-stat-number">∞</span><span className="ys-cosmic-stat-label">YOUR FREQUENCY</span></div>
        </div>
      </div>
      <div className="ys-cosmic-visual" aria-hidden="true">
        <div className="ys-cosmic-orbit ys-cosmic-orbit-one" />
        <div className="ys-cosmic-orbit ys-cosmic-orbit-two" />
        <div className="ys-cosmic-orbit ys-cosmic-orbit-three" />
        <div className="ys-cosmic-sphere">
          <svg viewBox="0 0 420 420" role="presentation">
            <defs>
              <radialGradient id="ys-orb-core" cx="38%" cy="31%" r="72%">
                <stop offset="0%" stopColor="#dffff8" stopOpacity=".95" />
                <stop offset="19%" stopColor="#62e8d6" stopOpacity=".54" />
                <stop offset="54%" stopColor="#0c6567" stopOpacity=".22" />
                <stop offset="100%" stopColor="#031317" stopOpacity=".08" />
              </radialGradient>
              <linearGradient id="ys-orb-wire" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e7fff9" stopOpacity=".95" />
                <stop offset="48%" stopColor="#55e8d5" stopOpacity=".65" />
                <stop offset="100%" stopColor="#2b8290" stopOpacity=".18" />
              </linearGradient>
              <filter id="ys-orb-glow"><feGaussianBlur stdDeviation="4" /></filter>
            </defs>
            <circle cx="210" cy="210" r="150" fill="url(#ys-orb-core)" />
            <circle cx="210" cy="210" r="150" fill="none" stroke="url(#ys-orb-wire)" strokeWidth="1.4" />
            <ellipse cx="210" cy="210" rx="150" ry="54" fill="none" stroke="url(#ys-orb-wire)" strokeWidth="1.1" />
            <ellipse cx="210" cy="210" rx="150" ry="104" fill="none" stroke="url(#ys-orb-wire)" strokeWidth=".8" opacity=".66" />
            <ellipse cx="210" cy="210" rx="54" ry="150" fill="none" stroke="url(#ys-orb-wire)" strokeWidth="1" />
            <ellipse cx="210" cy="210" rx="104" ry="150" fill="none" stroke="url(#ys-orb-wire)" strokeWidth=".8" opacity=".7" />
            <path d="M82 145 L210 60 L338 145 L338 275 L210 360 L82 275 Z" fill="none" stroke="url(#ys-orb-wire)" strokeWidth="1.2" opacity=".85" />
            <path d="M82 145 L210 275 L338 145 M82 275 L210 145 L338 275 M210 60 L210 360" fill="none" stroke="url(#ys-orb-wire)" strokeWidth="1" opacity=".7" />
            <path d="M132 104 L210 210 L288 104 M132 316 L210 210 L288 316" fill="none" stroke="#c5fff5" strokeWidth="1.1" opacity=".56" />
            <path d="M210 210 L210 60 M210 210 L338 145 M210 210 L338 275 M210 210 L210 360 M210 210 L82 275 M210 210 L82 145" stroke="#d8fff9" strokeWidth="1.1" opacity=".75" />
            <circle cx="210" cy="210" r="8" fill="#eafffb" filter="url(#ys-orb-glow)" />
            <circle cx="210" cy="210" r="3.5" fill="#f4fffd" />
          </svg>
          <div className="ys-cosmic-orb-flare" />
        </div>
        <div className="ys-cosmic-visual-label ys-cosmic-visual-label-top">CORE FREQUENCY <span>07.28 THz</span></div>
        <div className="ys-cosmic-visual-label ys-cosmic-visual-label-bottom">AUDIO SYSTEM <span>ONLINE</span></div>
        <div className="ys-cosmic-crosshair ys-cosmic-crosshair-left" />
        <div className="ys-cosmic-crosshair ys-cosmic-crosshair-right" />
      </div>
    </div>
    <div className="ys-cosmic-footerline">
      <span>ENGINEERED FOR THE LISTENING EXPERIENCE</span>
      <span>YS<span className="ys-cosmic-footer-dot">.</span> // EST. IN SOUND</span>
    </div>
  </section>
);
