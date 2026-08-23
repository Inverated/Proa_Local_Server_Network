import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import './styles.css';

export default function ConsoleTab() {
    const terminalRef = useRef(null);

    useEffect(() => {
        const term = new Terminal({
            cursorBlink: true,
            rows: 20,
            cols: 80,
            theme: {
                background: "#1e1e1e",
            },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        terminalRef.current && term.open(terminalRef.current);
        fitAddon.fit();

        let socket: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let disposed = false;

        function connect() {
            if (disposed) return;

            const token = localStorage.getItem("token");
            socket = new WebSocket("ws://localhost:3001?token=" + token);

            socket.onopen = () => {
                term.writeln("Connected");
            };

            socket.onmessage = (event) => {
                term.write(event.data);
            };

            term.onData((data: string) => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(data);
                }
            });

            socket.onclose = () => {
                term.writeln("\r\nConnection closed. Reconnecting...");
                scheduleReconnect();
            };

            socket.onerror = () => {
                // onclose will fire after this, which triggers reconnect
            };
        }

        function scheduleReconnect() {
            if (disposed) return;
            reconnectTimeout = setTimeout(() => {
                connect();
            }, 2000);
        }

        connect();

        const handleResize = () => fitAddon.fit();
        window.addEventListener("resize", handleResize);

        return () => {
            disposed = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (socket) socket.close();
            window.removeEventListener("resize", handleResize);
            term.dispose();
        };
    }, []);

    return (
        <div
            ref={terminalRef}
            style={{
                width: "100%",
                height: "70vh",
                textAlign: "left",
            }}
        />
    );
}
