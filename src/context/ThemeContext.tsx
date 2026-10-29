import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';
export type FontFamily = 'lexend' | 'jakarta' | 'inter' | 'outfit' | 'mono';
export type FontSize = 'normal' | 'large';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  fontFamily: FontFamily;
  setFontFamily: (f: FontFamily) => void;
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
  highContrast: boolean;
  toggleHighContrast: () => void;
  setHighContrast: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('yousong_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return 'dark'; // default to dark
    } catch {
      return 'dark';
    }
  });

  const [fontFamily, setFontFamilyState] = useState<FontFamily>(() => {
    try {
      const saved = localStorage.getItem('yousong_font') as FontFamily;
      if (['lexend', 'jakarta', 'inter', 'outfit', 'mono'].includes(saved)) return saved;
      return 'lexend'; // default to Lexend for accessibility
    } catch {
      return 'lexend';
    }
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    try {
      const saved = localStorage.getItem('yousong_fontsize') as FontSize;
      if (saved === 'large' || saved === 'normal') return saved;
      return 'normal';
    } catch {
      return 'normal';
    }
  });

  const [highContrast, setHighContrastState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yousong_high_contrast') === 'true';
    } catch {
      return false;
    }
  });

  // Apply theme class to root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
    localStorage.setItem('yousong_theme', theme);
  }, [theme]);

  // Apply font family class to root
  useEffect(() => {
    const root = document.documentElement;
    ['font-lexend', 'font-jakarta', 'font-inter', 'font-outfit', 'font-mono'].forEach((c) =>
      root.classList.remove(c)
    );
    root.classList.add(`font-${fontFamily}`);
    localStorage.setItem('yousong_font', fontFamily);
  }, [fontFamily]);

  // Apply font scale to root
  useEffect(() => {
    const root = document.documentElement;
    if (fontSize === 'large') {
      root.classList.add('text-scale-large');
    } else {
      root.classList.remove('text-scale-large');
    }
    localStorage.setItem('yousong_fontsize', fontSize);
  }, [fontSize]);

  // Apply high contrast mode to root
  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    localStorage.setItem('yousong_high_contrast', String(highContrast));
  }, [highContrast]);

  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  const setTheme = (t: Theme) => setThemeState(t);
  const setFontFamily = (f: FontFamily) => setFontFamilyState(f);
  const setFontSize = (s: FontSize) => setFontSizeState(s);
  const toggleHighContrast = () => setHighContrastState((prev) => !prev);
  const setHighContrast = (v: boolean) => setHighContrastState(v);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        fontFamily,
        setFontFamily,
        fontSize,
        setFontSize,
        highContrast,
        toggleHighContrast,
        setHighContrast,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
