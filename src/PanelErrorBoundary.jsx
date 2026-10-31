import React from 'react';

export default class PanelErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <section className="folder-card panel-error" role="alert">
        <p className="meta-line">PANEL ERROR</p>
        <h2>{this.props.panel} could not be displayed.</h2>
        <p>The rest of the dashboard is still available.</p>
      </section>;
    }

    return this.props.children;
  }
}
