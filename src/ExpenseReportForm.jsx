import { useState, useRef } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import SignatureCanvas from 'react-signature-canvas';
import { useLanguage } from './LanguageContext';

export default function ExpenseReportForm() {
  const { language, toggleLanguage, t } = useLanguage();
  const today = new Date().toLocaleDateString('en-CA');
  const sigCanvas = useRef(null);
  const [form, setForm] = useState({
    name: "",
    position: "",
    email: "",
    phone: "",
    date: "",
    officers: "",
    signature: "", // This will now be base64 image data
    signatureDate: today,
  });

  const [budgetConfirmed, setBudgetConfirmed] = useState(false);
  const [truthConfirmed, setTruthConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [items, setItems] = useState([
    {
      description: "",
      budgetLine: "",
      amount: "",
      notes: "",
      officers: "",
      receipts: []
    }
  ]);

  const updateForm = (field, value) =>
    setForm({ ...form, [field]: value });

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const addItem = () =>
    setItems([
      ...items,
      { description: "", budgetLine: "", amount: "", notes: "", officers: "", receipts: [] }
  ]);

  const deleteItem = (index) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
  };

  const total = items.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const updateReceipts = (index, files) => {
    const updated = [...items];
    // Only allow one image file
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      updated[index].receipts = [files[0]];
    } else {
      updated[index].receipts = [];
    }
    setItems(updated);
  };

  const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });

  const submit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate signature
      if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
        alert(t('signatureRequired'));
        setIsSubmitting(false);
        return;
      }

      // Get signature from canvas
      let signatureData = "";
      if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
        signatureData = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
      }

      // Convert receipts to base64 with compression
      const itemsWithBase64Receipts = await Promise.all(
        items.map(async (item) => {
          const receiptsWithBase64 = await Promise.all(
            item.receipts.map(async (receipt) => {
              if (receipt) {
                // Compress the image first
                const compressedBlob = await compressImage(receipt);
                // Convert compressed blob to base64
                const base64 = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(compressedBlob);
                });
                return {
                  name: receipt.name,
                  type: receipt.type,
                  data: base64
                };
              }
              return null;
            }).filter(Boolean)
          );
          return {
            ...item,
            receipts: receiptsWithBase64
          };
        })
      );

      const payload = {
        ...form,
        signature: signatureData,
        items: itemsWithBase64Receipts
      };

      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Submission failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setShowModal(true);
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Submission error:', error);
      alert(t('submissionFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

const officers = [
  { key: "president", label: t('president') },
  { key: "vpFinance", label: t('vpFinance') },
  { key: "vpExternal", label: t('vpExternal') },
  { key: "vpInternal", label: t('vpInternal') },
  { key: "vpAcademic", label: t('vpAcademic') },
  { key: "vpServices", label: t('vpServices') },
  { key: "vpCommunications", label: t('vpCommunications') },
  { key: "vpSocial", label: t('vpSocial') },
  { key: "vpPhilanthropic", label: t('vpPhilanthropic') },
  { key: "vpEquity", label: t('vpEquity') },
  { key: "vpSustainability", label: t('vpSustainability') },
  { key: "vpFrancophone", label: t('vpFrancophone') },
  { key: "other", label: t('other') }
];


  return (
    <div className="container p-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button 
          onClick={toggleLanguage} 
          className="btn btn-outline-primary"
          style={{ minWidth: '80px' }}
        >
          {language === 'en' ? '🇫🇷 FR' : '🇬🇧 EN'}
        </button>
        <a href="/login" className="btn btn-outline-secondary">{t('adminLogin')}</a>
      </div>
      <div className="container-fluid text-center mb-3">
        <img src="/ess-banner.png" alt="ESS Logo" className="mb-3 w-50"></img>
        <h1><strong>{t('reimbursementForm')}</strong></h1>
      </div>

      <p>{t('intro1')}</p>

      <p>{t('intro2')}</p>

      <p>{t('intro3')}</p>

      <p>{t('intro4')}</p>

      <ul>
        <li>{t('expenseEligibility')}</li>
        <li>{t('timelySubmission')}</li>
        <li>{t('requiredDocumentation')}</li>
        <li>{t('approvalProcess')}</li>
      </ul>

      <p><strong>{t('paymentMethod')}</strong> <i>{t('paymentMethodDetails')}</i></p>
      <p className="pb-3">{t('closingNote')} <a href="mailto:vpfa@uottawaess.ca">vpfa@uottawaess.ca</a>.</p>

      <hr className="pb-3"></hr>

      <form onSubmit={submit}>
        <p className="">{t('name')}<br></br>
        <input
          className="form-control"
          required
          value={form.name}
          onChange={(e) => updateForm("name", e.target.value)}
        />
        </p>
        
        <p>{t('email')}<br></br>
        <input
          className="form-control"
          type="email"
          required
          value={form.email}
          onChange={(e) => updateForm("email", e.target.value)}
        />
        </p>

        <p>{t('phone')}<br></br>
        <input
          className="form-control"
          type="tel"
          pattern="^\d{10}$"
          required
          value={form.phone}
          onChange={(e) => updateForm("phone", e.target.value)}
        />
        </p>

        <p>{t('invoiceDate')} <br></br>
          <input
            className="form-control"
            type="date"
            max={new Date().toLocaleDateString('en-CA')}
            required
            value={form.date}
            onChange={(e) => updateForm("date", e.target.value)}
          />
        </p>

        <h3 className="pt-5">{t('expenses')}</h3>

        {items.map((item, i) => (
          <div className="border rounded p-3 mb-3" key={i}>
            <p><strong>{t('expense')} #{i + 1}</strong></p>
            <div className="row g-2">
              <div className="col-md-4">
                {t('description')} <br></br>
                <input
                  className="form-control"
                  required
                  value={item.description}
                  onChange={(e) =>
                    updateItem(i, "description", e.target.value)
                  }
                />
              </div>

              <div className="col-md-2">
                {t('budget')} <br></br>
                <select
                  className="form-control"
                  required
                  value={item.officers}
                  onChange={(e) =>
                    updateItem(i, "officers", e.target.value)
                  }
                >
                  <option value="">{t('select')}</option>
                  {officers.map((officer) => (
                    <option key={officer.key} value={officer.label}>
                      {officer.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-2">
                {t('budgetLine')} <br></br>
                <input
                  className="form-control"
                  required
                  value={item.budgetLine}
                  onChange={(e) =>
                    updateItem(i, "budgetLine", e.target.value)
                  }
                />
              </div>

              <div className="col-md-2">
                {t('amount')} <br></br>
                <input
                  step="0.01"
                  className="form-control"
                  required
                  value={item.amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
                      updateItem(i, "amount", value);
                    }
                  }}
                />
              </div>

              <div className="col-md-2">
                {t('receipt')} <br></br>
                <input
                  type="file"
                  className="form-control"
                  accept="image/*"
                  required
                  onChange={(e) => updateReceipts(i, e.target.files)}
                />
              </div>
            </div>

            <div className="row g-2 mt-2">
              <div className="col-12">
                {t('notes')}<br></br>
                <input
                  className="form-control"
                  placeholder=""
                  value={item.notes}
                  onChange={(e) =>
                    updateItem(i, "notes", e.target.value)
                  }
                />
              </div>
            </div>

            {item.receipts.length > 0 && (
              <small className="text-muted">
                {t('receiptAttached')}
              </small>
            )}
            {i > 0 && (
              <div className="text-end">
                <button
                  type="button"
                  className="btn btn-sm btn-danger mt-2"
                  onClick={() => deleteItem(i)}
                >
                  X
                </button>
              </div>
            )}
          </div>
        ))}


        <a className="btn btn-dark my-2" type="button" onClick={addItem}>
          {t('addExpense')}
        </a>

        <div className="py-5 text-center border my-3">
          <h3 className="">{t('total')}: ${total.toFixed(2)}</h3>
        </div>
    
        <div className="col-12 col-md-6">
          <p>{t('recipientSignature')} <br></br>
          <div style={{ border: '1px solid #ccc', borderRadius: '4px', width: '100%' }}>
            <SignatureCanvas
              ref={sigCanvas}
              canvasProps={{
                height: 200,
                className: 'sigCanvas w-100'
              }}
              backgroundColor="white"
            />
          </div>
          <small className="text-muted">{t('signatureInstruction')}</small>
          <br />
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary mt-1"
            onClick={() => sigCanvas.current && sigCanvas.current.clear()}
          >
            {t('clearSignature')}
          </button>
          </p>

          <p>{t('dateOfSignature')}<br></br>
            <input
              className="form-control"
              type="date"
              required
              readOnly
              value={form.signatureDate}
            />
          </p>
        </div>

        <div className="mb-3">
          <div className="form-check" style={{ alignItems: "center", display: "flex" }}>
            <input
              className="form-check-input me-3"
              type="checkbox"
              id="budgetConfirm"
              checked={budgetConfirmed}
              onChange={(e) => setBudgetConfirmed(e.target.checked)}
              required
            />
            <label className="form-check-label" htmlFor="budgetConfirm" style={{ marginBottom: 0 }}>
              <strong>{t('budgetConfirmTitle')}</strong> <br></br>{t('budgetConfirmText')}
            </label>
          </div>
        </div>

        <div className="mb-3">
          <div className="form-check" style={{ alignItems: "center", display: "flex" }}>
            <input
              className="form-check-input me-3"
              type="checkbox"
              id="truthConfirm"
              checked={truthConfirmed}
              onChange={(e) => setTruthConfirmed(e.target.checked)}
              required
            />
            <label className="form-check-label" htmlFor="truthConfirm" style={{ marginBottom: 0 }}>
              <strong>{t('truthTitle')}</strong> <br></br>{t('truthText')}
            </label>
          </div>
        </div>

        <div className="text-center">
          <button className="btn btn-dark my-2" type="submit" disabled={!budgetConfirmed || !truthConfirmed || isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                {t('submitting')}
              </>
            ) : (
              t('submitButton')
            )}
          </button>
        </div>
      </form>

      {/* Submission Success Modal */}
      <div className={`modal ${showModal ? 'show' : ''}`} style={{ display: showModal ? 'block' : 'none' }} tabIndex="-1">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Submission Successful</h5>
              <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
            </div>
            <div className="modal-body">
              Your expense report has been submitted successfully! ✅
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Close</button>
            </div>
          </div>
        </div>
      </div>
      {showModal && <div className="modal-backdrop show"></div>}

    </div>
  );
}
