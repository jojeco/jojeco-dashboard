export default function HomeAssistantPage() {
  return (
    <div className="j-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      <iframe
        src="http://192.168.50.13:8123"
        style={{
          flex: 1,
          width: '100%',
          height: 'calc(100vh - 120px)',
          border: 'none',
          borderRadius: 8,
        }}
        title="Home Assistant"
        allow="microphone"
      />
    </div>
  );
}
