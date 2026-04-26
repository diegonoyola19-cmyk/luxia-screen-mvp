import { useState, useRef, useEffect } from 'react';
import { CatalogItem, searchCatalogItems } from '../../../lib/itemCatalog';

interface ItemAutocompleteProps {
  value: string; // The itemCode
  onSelect: (item: CatalogItem | null) => void;
  placeholder?: string;
  initialName?: string;
}

export function ItemAutocomplete({ value, onSelect, placeholder = "Buscar por codigo o nombre...", initialName = "" }: ItemAutocompleteProps) {
  const [query, setQuery] = useState(initialName || value);
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If external value changes, we might want to update, but usually it's handled via initialName
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 2) {
      setResults(searchCatalogItems(val, 15));
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
    
    // If they clear the input
    if (val === '') {
      onSelect(null);
    }
  };

  const handleSelect = (item: CatalogItem) => {
    setQuery(item.description);
    setIsOpen(false);
    onSelect(item);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={handleSearch}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
      {isOpen && results.length > 0 && (
        <ul className="autocomplete-dropdown" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #ccc',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          listStyle: 'none',
          padding: 0,
          margin: 0,
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          {results.map((item) => (
            <li
              key={item.itemCode}
              onClick={() => handleSelect(item)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              {item.imageUrl && (
                <div style={{ width: '40px', height: '40px', flexShrink: 0, backgroundColor: '#f9fafb', borderRadius: '4px', overflow: 'hidden', border: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img 
                    src={item.imageUrl} 
                    alt="" 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.itemCode}</div>
                <div style={{ color: '#666', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
