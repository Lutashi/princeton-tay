//Components
import { Stack, useMediaQuery } from "@chakra-ui/react";
import { Sidebar } from "@/components/Sidebar";
import { Chat } from "@/components/Chat";

export default function Home() {
    const [isResponsive] = useMediaQuery('(max-width: 800px)')

    return (
        <Stack
            direction={!isResponsive ? "row" : "column"}
            width="full"
            height="full"
            spacing={0}
            style={{ paddingTop: 0, backgroundColor: "#343541" }}
        >
            <Sidebar isResponsive={isResponsive} />
            <Stack flex={1} height="full">
                <Chat />
            </Stack>
        </Stack>
    );
};