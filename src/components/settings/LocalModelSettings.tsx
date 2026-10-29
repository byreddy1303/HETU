import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  discoverLocalModels,
  getLocalLearningConfig,
  localModelDefaultUrl,
  saveLocalLearningConfig,
  type LocalLearningEngineConfig,
  type LocalModelDiscovery
} from '@/lib/local-learning-engine';

export default function LocalModelSettings() {
  const [config, setConfig] = useState<LocalLearningEngineConfig | null>(null);
  const [discovery, setDiscovery] = useState<LocalModelDiscovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void getLocalLearningConfig()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Local model settings could not load.');
      });
    return () => {
      active = false;
    };
  }, [retry]);
  async function perform(discover: boolean) {
    if (!config) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (discover) {
        const result = await discoverLocalModels(config);
        setDiscovery(result);
        if (!result.reachable) setError(result.message || 'The local model server is unavailable.');
      } else {
        setConfig(await saveLocalLearningConfig(config));
        setNotice('Local model settings saved.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The local model could not respond.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card id="settings-model" className="settings-anchor" tabIndex={-1}>
      <CardHeader title="Local model" />
      <CardBody className="space-y-3">
        <p className="text-sm text-text-muted">
          Use an installed Ollama or local compatible model for evidence-linked study follow-ups. No
          cloud API key is needed.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {!config && (
          <Button size="sm" onClick={() => setRetry((value) => value + 1)}>
            Retry local model settings
          </Button>
        )}
        {config && (
          <fieldset disabled={busy} className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
              />
              Prepare automatic study follow-ups
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Local server
                <Select
                  value={config.provider}
                  onChange={(event) => {
                    const provider = event.target.value as LocalLearningEngineConfig['provider'];
                    setConfig({
                      ...config,
                      provider,
                      base_url: localModelDefaultUrl(provider),
                      model: ''
                    });
                    setDiscovery(null);
                  }}
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai_compatible">Local OpenAI-compatible server</option>
                </Select>
              </label>
              <label className="grid gap-1 text-sm">
                Loopback server address
                <Input
                  value={config.base_url}
                  onChange={(event) => {
                    setConfig({ ...config, base_url: event.target.value });
                    setDiscovery(null);
                  }}
                />
              </label>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void perform(true)}>
              {busy ? 'Checking…' : 'Find installed models'}
            </Button>
            <label className="grid gap-1 text-sm">
              Model
              {discovery?.models.length ? (
                <Select
                  value={config.model}
                  onChange={(event) => setConfig({ ...config, model: event.target.value })}
                >
                  <option value="">Choose a model</option>
                  {discovery.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name || model.id}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={config.model}
                  onChange={(event) => setConfig({ ...config, model: event.target.value })}
                  placeholder="Find models or enter the installed model name"
                />
              )}
            </label>
            <Button size="sm" onClick={() => void perform(false)}>
              Save local model
            </Button>
          </fieldset>
        )}
        {notice && (
          <p role="status" className="text-sm text-text-muted">
            {notice}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
