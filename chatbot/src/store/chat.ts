import { create } from "zustand";
import { v4 } from 'uuid';
import store from "store2";

export interface UseChatProps {
    chat: Chat[],
    selectedChat: Chat | undefined,
    setChat: (payload: Chat) => void,
    addChat: (callback?: (id: string, selectedChat: Chat | undefined) => void) => void,
    editChat: (id: string, payload: Partial<Chat>) => void,
    addMessage: (id: string, action: ChatContent) => void,
    editMessage: (id: string, text: string) => void,
    setSelectedChat: (payload: { id: string }) => void,
    removeChat: (pyload: { id: string }) => void,
    clearAll: () => void,
};

type Chat = {
    id: string,
    role: string,
    content: ChatContent[]
};

export type Feedback = "up" | "down"

type ChatContent = {
    emitter: ChatContentEmmiter,
    message: string,
    feedback?: Feedback
};

type ChatContentEmmiter = "gpt" | "user" | "error";

// Safely parse saved chats from session storage
const getSafeSavedChats = (): Chat[] | undefined => {
    try {
        const raw = store.session("@chat");
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed as Chat[];
        }
        return undefined;
    } catch {
        return undefined;
    }
};

const initialChatState: Chat[] = getSafeSavedChats() || [
    // {
    //     id: '1',
    //     role: 'About this website',
    //     content: [
    //         {
    //             emitter: "user",
    //             message: "What website is this?"
    //         },
    //         {
    //             emitter: "gpt",
    //             message: "This website is a clone of the ChatGPT website interface created by @WesleyMaik.\n\nYou can also send commands to the original site, with the help of the official ChatGPT API."
    //         }
    //     ],
    // },
    // {
    //     id: '2',
    //     role: 'Follow me 😉',
    //     content: [
    //         {
    //             emitter: "user",
    //             message: "Follow me on \nTwitter [@euwesleymaik](https://twitter.com/euwesleymaik)\nInstagram [eumaik_](https://instagram.com/eumaik_)\nGitHub [WesleyMaik](https://github.com/wesleymaik)"
    //         },
    //         {
    //             emitter: "gpt",
    //             message: "Thanks!"
    //         }
    //     ],
    // }
];

export const useChat = create<UseChatProps>((set, get) => ({
    chat: initialChatState,
    selectedChat: initialChatState[0],
    setChat: async (payload) => set(({ chat }) => ({ chat: [...chat, payload] })),
    addChat: async (callback) => {
        // Reuse an existing empty chat if present; otherwise create a new one
        const existingEmptyChat = get().chat.find(({ content }) => content.length === 0);
        let id: string;
        if (existingEmptyChat) {
            id = existingEmptyChat.id;
            get().setSelectedChat({ id });
        } else {
            id = v4();
            get().setSelectedChat({ id });
            get().setChat({
                role: "New chat",
                id,
                content: []
            });
        }
        const selectedChat = get().chat.find((query) => query.id === id);
        if (callback) callback(id, selectedChat);
    },
    editChat: async (id, payload) => set(({ chat }) => {
        const selectedChat = chat.findIndex((query) => (query.id === id));
        if (selectedChat > -1) {
            chat[selectedChat] = { ...chat[selectedChat], ...payload };
            return ({ chat, selectedChat: chat[selectedChat] })
        };
        return ({});

    }),
    addMessage: async (id, action) => set(({ chat }) => {
        const selectedChat = chat.findIndex((query) => (query.id === id)),
            props = chat[selectedChat];

        if (selectedChat > -1) {
            chat[selectedChat] = { ...props, content: [...props['content'], action] }
            return ({ chat, selectedChat: chat[selectedChat] });
        };

        return ({});
    }),
    editMessage: async (id, text) => set(({ chat }) => {
        const selectedChat = chat.findIndex((query) => (query.id === id));
        if (selectedChat > -1) {
            const index = chat[selectedChat].content.length-1
            chat[selectedChat].content[index].message = text
            return ({ chat, selectedChat: chat[selectedChat] })
        };
        return ({});
    }),
    setSelectedChat: async (payload) => set(({ chat }) => {
        const selectedChat = chat.find(({ id }) => id === payload.id);
        return ({ selectedChat: selectedChat })
    }),
    removeChat: async (payload) => set(({ chat }) => {
        const newChat = chat.filter(({ id }) => id !== payload.id);
        return ({ chat: newChat });
    }),
    clearAll: async () => set({ chat: [], selectedChat: undefined })
}));