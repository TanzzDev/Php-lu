// Halaman uji untuk tests/e2e/embed-player.mjs — merender EmbedPlayer yang SAMA dengan produksi.
import { createRoot } from 'react-dom/client';
import EmbedPlayer from '../../src/components/EmbedPlayer.jsx';
import '../../src/styles/base.css';
import '../../src/styles/ui.css';
import '../../src/styles/player.css';

const servers = JSON.parse(new URLSearchParams(location.search).get('servers') ?? '[]');
window.__states = [];
createRoot(document.getElementById('root')).render(
  <EmbedPlayer
    playback={{ type: 'embed', source: servers[0].url, servers }}
    title="Film Uji"
    onState={(s) => window.__states.push(s)}
  />,
);
