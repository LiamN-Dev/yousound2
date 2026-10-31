import React, { useEffect } from 'react';

const ANNOUNCEMENT_SCRIPT_ID = 'yousong-betterstack-announcement-268966';

/**
 * Loads Better Stack's announcement widget once for the whole authenticated app.
 * The provider shows the banner only while a published announcement is active.
 */
export const BetterStackAnnouncement: React.FC = () => {
  useEffect(() => {
    if (document.getElementById(ANNOUNCEMENT_SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = ANNOUNCEMENT_SCRIPT_ID;
    script.src = 'https://incidents.betterstack.com/widgets/announcement.js';
    script.dataset.id = '268966';
    script.async = true;
    script.type = 'text/javascript';
    document.body.appendChild(script);

    return () => {
      // Do not remove the provider script on navigation; the announcement widget is global.
    };
  }, []);

  return null;
};
