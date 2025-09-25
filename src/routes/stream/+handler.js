export const GET = (context) => {
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  };

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      let messageCount = 0;
      let interval;

      // Function to send a message
      const sendMessage = () => {
        messageCount++;
        const timestamp = new Date().toISOString();
        const data = {
          id: messageCount,
          timestamp,
          message: `Hello from streaming route! Message #${messageCount}`,
          randomValue: Math.floor(Math.random() * 100),
        };

        // Format as Server-Sent Event
        const eventData = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(eventData));
      };

      // Send initial message
      sendMessage();

      // Send a message every 2 seconds
      interval = setInterval(() => {
        try {
          sendMessage();
        } catch (error) {
          // Client disconnected, clean up
          clearInterval(interval);
          try {
            controller.close();
          } catch (e) {
            // Already closed
          }
        }
      }, 2000);

      // Optional: Stop after 30 seconds to prevent infinite streams
      const timeout = setTimeout(() => {
        clearInterval(interval);
        try {
          const finalData = `data: ${JSON.stringify({
            message: "Stream ended",
            final: true,
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(finalData));
          controller.close();
        } catch (error) {
          // Stream already closed
        }
      }, 30000);
    },
  });

  return new Response(stream, { headers });
};
