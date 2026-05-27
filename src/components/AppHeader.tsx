type AppHeaderProps = {
  message: string
  error: string
}

function AppHeader({ message, error }: AppHeaderProps) {
  return (
    <header className="topbar">
      <div>
        <h1>Sloploop</h1>
        <p>Loop crafting and clip cleanup for game audio in the browser.</p>
      </div>
      <div className="status-row">
        <span>{message}</span>
        {error ? <span className="error-chip">{error}</span> : null}
      </div>
    </header>
  )
}

export default AppHeader