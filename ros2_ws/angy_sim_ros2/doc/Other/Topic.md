Update the ConnectionStatusPanel to include a compact ROS topic discovery section for rosbridge connections.

Requirements:
1. Keep the Connection card focused and compact.
2. Only show topic discovery when:
   - selected transport kind is "rosbridge"
   - connection status is "connected"

3. Add a topic summary below the existing rosbridge help text:
   - "Topics: N discovered"
   - "Last updated: <time>" when available
   - "Refresh topics" button

4. Do not show the full topic list by default.
5. Add a collapsible control:
   - collapsed label: "Show topics"
   - expanded label: "Hide topics"

6. When expanded, show the discovered topic names in a small scrollable list.

7. Add a default filter so common system topics are hidden from the compact list:
   - /rosout
   - /parameter_events
   - /rosapi/*
   - /client_count
   - /connected_clients

8. Add a toggle:
   - "Show system topics"
   When enabled, include system topics in the list and count.

9. Topic refresh behavior:
   - Auto-load topics once when rosbridge first becomes connected.
   - Let the user refresh manually with the "Refresh topics" button.
   - Show loading state while refreshing.
   - Show an error message if topic discovery fails.

10. Keep the architecture transport-agnostic:
   - Do not make ConnectionStatusPanel import roslib directly.
   - Do not put rosbridge-specific implementation details in the simulation core.
   - Add any rosbridge topic discovery logic under:
     src/infrastructure/communication/rosbridge/
   - Expose only a generic UI-facing capability/API from the app/provider layer.

11. Use rosapi through rosbridge to query topics if available.
12. Add tests:
   - no topic section for none/mock/memory transports
   - no topic section for rosbridge while disconnected/connecting/error
   - connected rosbridge shows summary and Refresh button
   - full topic list is hidden by default
   - Show topics expands the list
   - system topics are hidden by default
   - Show system topics includes system topics
   - refresh error is displayed
   - no roslib imports outside src/infrastructure/communication/rosbridge/

Expected UX:
Connected  ws://localhost:9090
Connects through rosbridge_server using WebSocket.

Topics: 2 discovered        [Refresh topics]
Last updated: 7:55:12 PM
[Show topics]