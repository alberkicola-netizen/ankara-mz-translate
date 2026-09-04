import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { getUiLang, setUiLang } from "./lib/storage";
import { UiLangContext } from "./lib/ui-lang";
import type { Lang } from "./types";
import { Gate } from "./pages/Gate";
import { RequireAuth } from "./pages/RequireAuth";
import { Home } from "./pages/Home";
import { Category } from "./pages/Category";
import { PhrasePage } from "./pages/PhrasePage";
import { SearchPage } from "./pages/SearchPage";
import { Favorites } from "./pages/Favorites";
import { SpeechPage } from "./pages/SpeechPage";
import { More } from "./pages/More";
import { Training } from "./pages/Training";
import { Evaluation } from "./pages/Evaluation";
import { Governance } from "./pages/Governance";
import { Safety } from "./pages/Safety";
import { About } from "./pages/About";
import { Live } from "./pages/Live";
import { Invite } from "./pages/Invite";
import { Glossary } from "./pages/Glossary";
import { History } from "./pages/History";
import { SessionNew } from "./pages/SessionNew";
import { SessionJoin } from "./pages/SessionJoin";
import { SessionRoom } from "./pages/SessionRoom";
import { RoomNew } from "./pages/RoomNew";
import { RoomJoin } from "./pages/RoomJoin";
import { RoomPage } from "./pages/RoomPage";
import { joinCodeFromLocation, roomCodeFromLocation } from "./lib/inviteUrl";

export function App() {
  const [lang, setLangState] = useState<Lang>(getUiLang());

  return (
    <UiLangContext.Provider
      value={{
        lang,
        setLang: (l) => {
          setUiLang(l);
          setLangState(l);
        },
      }}
    >
      <BrowserRouter>
        <QrJoinRedirect />
        <Routes>
          <Route path="/gate" element={<Gate />} />
          {/* QR guests: /?join=CODE (phone-safe) or /join/CODE */}
          <Route path="/join/:code?" element={<SessionJoin />} />
          <Route path="/session/:code" element={<SessionRoom />} />
          {/* Multi-participant rooms (Supabase): /?room=ID or /join-room/ID */}
          <Route path="/join-room/:roomId?" element={<RoomJoin />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/category/:id" element={<Category />} />
              <Route path="/phrase/:id" element={<PhrasePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/speech" element={<SpeechPage />} />
              <Route path="/live" element={<Live />} />
              <Route path="/invite" element={<Invite />} />
              <Route path="/glossary" element={<Glossary />} />
              <Route path="/history" element={<History />} />
              <Route path="/session/new" element={<SessionNew />} />
              <Route path="/room/new" element={<RoomNew />} />
              <Route path="/more" element={<More />} />
              <Route path="/training" element={<Training />} />
              <Route path="/evaluation" element={<Evaluation />} />
              <Route path="/governance" element={<Governance />} />
              <Route path="/safety" element={<Safety />} />
              <Route path="/about" element={<About />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </UiLangContext.Provider>
  );
}

/** Phone cameras open /?join=CODE or /?room=ID — send them to the right page before the PIN gate. */
function QrJoinRedirect() {
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    const room = roomCodeFromLocation();
    if (room && !loc.pathname.startsWith("/join-room")) {
      nav(`/join-room/${room}`, { replace: true });
      return;
    }
    const code = joinCodeFromLocation();
    if (code && !loc.pathname.startsWith("/join")) {
      nav(`/join/${code}`, { replace: true });
    }
  }, [loc.pathname, loc.search, loc.hash, nav]);
  return null;
}
