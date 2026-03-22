import { useState, useRef, useCallback } from "react";
import { Box, useToast } from "@chakra-ui/react";
import LandingPage from "./LandingPage";
import Lobby from "./Lobby";
import CodeEditor from "./CodeEditor";

const BASE_URL = "http://localhost:4000";

const App = () => {
  const [view, setView] = useState("landing"); // 'landing' | 'lobby' | 'editor'
  const [roomCode, setRoomCode] = useState("");
  const [userName, setUserName] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const ws = useRef(null);
  const toast = useToast();

  // Derive isEditor from participants during render — avoids stale closure issues.
  // Host always has isEditor: true in their participant entry (set server-side).
  // Falls back to isHost so the host can edit even before room-joined fires.
  const userNameRef = useRef("");
  const isHostRef = useRef(false);
  const isEditor =
    isHost ||
    participants.some((p) => p.name === userNameRef.current && p.isEditor);

  const openSocket = useCallback((onReady) => {
    const socket = new WebSocket("ws://localhost:4000");
    ws.current = socket;

    socket.onopen = () => onReady(socket);

    socket.onmessage = (event) => {
      const { event: evt, data } = JSON.parse(event.data);

      switch (evt) {
        case "room-joined":
          setParticipants(data.participants);
          break;
        case "participant-joined":
          setParticipants((prev) => [
            ...prev,
            { name: data.name, isHost: data.isHost, isEditor: data.isEditor },
          ]);
          break;
        case "participant-left":
          setParticipants((prev) => prev.filter((p) => p.name !== data.name));
          break;
        case "session-started":
          setView("editor");
          break;
        case "editor-granted":
          // Update participants — isEditor is derived from this, so the
          // affected client's Monaco will automatically become editable.
          setParticipants((prev) =>
            prev.map((p) => (p.name === data.name ? { ...p, isEditor: true } : p))
          );
          break;
        case "editor-revoked":
          setParticipants((prev) =>
            prev.map((p) => (p.name === data.name ? { ...p, isEditor: false } : p))
          );
          break;
        case "host-left":
          toast({
            title: "Host has left the session",
            status: "warning",
            duration: 4000,
            isClosable: true,
          });
          socket.close();
          ws.current = null;
          setView("landing");
          setParticipants([]);
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      console.log("[WS] Disconnected");
    };
  }, [toast]);

  const handleHostSession = async (name) => {
    const res = await fetch(`${BASE_URL}/api/room/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostName: name }),
    });
    const { roomCode: code } = await res.json();

    userNameRef.current = name;
    isHostRef.current = true;
    setUserName(name);
    setRoomCode(code);
    setIsHost(true);

    openSocket((socket) => {
      socket.send(JSON.stringify({
        event: "join-room",
        data: { roomCode: code, name, isHost: true },
      }));
    });

    setView("lobby");
  };

  const handleJoinSession = async (name, code) => {
    const upper = code.toUpperCase();
    const res = await fetch(`${BASE_URL}/api/room/${upper}/exists`);
    const { exists } = await res.json();

    if (!exists) {
      throw new Error("Room not found");
    }

    userNameRef.current = name;
    isHostRef.current = false;
    setUserName(name);
    setRoomCode(upper);
    setIsHost(false);

    openSocket((socket) => {
      socket.send(JSON.stringify({
        event: "join-room",
        data: { roomCode: upper, name, isHost: false },
      }));
    });

    setView("lobby");
  };

  const handleStartSession = () => {
    if (!ws.current) return;
    ws.current.send(JSON.stringify({ event: "start-session", data: { roomCode } }));
    setView("editor");
  };

  const handleLeave = () => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    userNameRef.current = "";
    isHostRef.current = false;
    setView("landing");
    setRoomCode("");
    setUserName("");
    setIsHost(false);
    setParticipants([]);
  };

  return (
    <Box bg="gray.900" minH="100vh">
      {view === "landing" && (
        <LandingPage onHostSession={handleHostSession} onJoinSession={handleJoinSession} />
      )}
      {view === "lobby" && (
        <Lobby
          roomCode={roomCode}
          userName={userName}
          isHost={isHost}
          participants={participants}
          onStartSession={handleStartSession}
          onLeave={handleLeave}
        />
      )}
      {view === "editor" && (
        <CodeEditor
          userName={userName}
          roomCode={roomCode}
          isHost={isHost}
          isEditor={isEditor}
          ws={ws}
          participants={participants}
          setParticipants={setParticipants}
          onLeave={handleLeave}
        />
      )}
    </Box>
  );
};

export default App;
