import React from 'react';

const snowflakes = Array.from({ length: 30 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  delay: `-${(index * 7) % 24}s`,
  duration: `${16 + ((index * 11) % 14)}s`,
  size: `${6 + ((index * 3) % 7)}px`,
  opacity: 0.3 + (((index * 13) % 6) * 0.08),
}));

const lights = Array.from({ length: 24 }, (_, index) => ({
  left: `${(index * 100) / 23}%`,
  delay: `-${(index % 7) * 0.31}s`,
}));

export const ChristmasEffects: React.FC = () => (
  <div className="ys-christmas-effects" aria-hidden="true">
    <div className="ys-christmas-garland">
      {lights.map((light, index) => (
        <React.Fragment key={index}>
          <span
            className="ys-christmas-bulb"
            style={{ left: light.left, animationDelay: light.delay }}
          />
          {index % 3 === 0 && (
            <span className="ys-christmas-ornament" style={{ left: light.left }} />
          )}
        </React.Fragment>
      ))}
    </div>
    <div className="ys-christmas-snow">
      {snowflakes.map((flake, index) => (
        <span
          key={index}
          className="ys-christmas-flake"
          style={{
            left: flake.left,
            animationDelay: flake.delay,
            animationDuration: flake.duration,
            fontSize: flake.size,
            opacity: flake.opacity,
          }}
        >
          ❄
        </span>
      ))}
    </div>
    <div className="ys-christmas-corner ys-christmas-corner-left">
      <span>🎄</span><i>✦</i><b>🎁</b>
    </div>
    <div className="ys-christmas-corner ys-christmas-corner-right">
      <span>🎄</span><i>✦</i><b>🔔</b>
    </div>
    <div className="ys-christmas-bottom-decor">
      <span>✦</span><span>❄</span><span>✦</span><span>❄</span><span>✦</span>
    </div>
  </div>
);
