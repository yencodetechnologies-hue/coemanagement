import {
  MdDashboard,
  MdSecurity,
  MdPeople,
  MdNotifications,
  MdSettings,
  MdApartment,
  MdCreditCard,
  MdSupportAgent,
  MdCampaign,
  MdDescription,
  MdWorkspacePremium,
} from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';

// Same pattern used earlier — keep in sync if you change the number.
const WHATSAPP_PHONE_NUMBER = '919876543210';
const WHATSAPP_MESSAGE = 'Hi! I have a question about my property.';
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_PHONE_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

// Single source of truth for the sidebar.
// `to`       → route path (client-side)
// `label`    → text shown in sidebar
// `icon`     → react-icons component
// `color`    → tint applied to the icon
// `end`      → exact-match route (for Dashboard "/")
// `external` → true = opens in a new tab instead of client-side routing
const SIDEBAR_LINKS = [
  { id: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: MdDashboard, color: '#2563eb', end: true },
  { id: 'blocks', to: '/dashboard/blocks', label: 'Blocks', icon: MdApartment, color: '#0ea5e9' },
  { id: 'users', to: '/dashboard/users', label: 'Users', icon: MdPeople, color: '#8b5cf6' },
  { id: 'security', to: '/dashboard/security', label: 'Security', icon: MdSecurity, color: '#dc2626' },
  { id: 'payments', to: '/dashboard/payments', label: 'Payments', icon: MdCreditCard, color: '#16a34a' },
  { id: 'notices', to: '/dashboard/notices', label: 'Notices', icon: MdNotifications, color: '#e11d48' },
  { id: 'ads', to: '/dashboard/ads', label: 'Ads', icon: MdCampaign, color: '#a855f7' },
  { id: 'documents', to: '/dashboard/documents', label: 'Documents', icon: MdDescription, color: '#0d9488' },
  { id: 'support', to: '/dashboard/support', label: 'Support', icon: MdSupportAgent, color: '#3b82f6' },
  { id: 'subscription', to: '/dashboard/subscription', label: 'Subscription', icon: MdWorkspacePremium, color: '#facc15' },
  { id: 'settings', to: '/dashboard/settings', label: 'Settings', icon: MdSettings, color: '#64748b' },
  {
    id: 'whatsapp',
    to: WHATSAPP_HREF,
    label: 'WhatsApp',
    icon: FaWhatsapp,
    color: '#25D366',
    external: true,
  },
];

export default SIDEBAR_LINKS;