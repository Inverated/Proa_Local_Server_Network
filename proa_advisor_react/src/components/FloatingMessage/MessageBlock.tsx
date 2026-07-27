import { useEffect, useState } from "react";
import Message from "./Message";
import "../../data_type/message";

export default function MessageBlock({Messages}: {Messages?: MessageData[]}) {
    const [messages, setMessages] = useState<MessageData[]>([{ message: "Welcome to the Proa Advisor Dashboard!", type: "info" }]);
    
    useEffect(() => {
        if (Messages && Messages.length > 0) {
            setMessages(Messages);
        }
    }, [Messages]);

    return (
        <div style={{ position: 'fixed', top: 0, left: '10%', width: '80%', zIndex: 9999 }}>
            {messages.map((msg, index) => (
                <Message
                    key={index}
                    message={msg}
                />
            ))}
        </div>

    )
}