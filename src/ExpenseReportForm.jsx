import { useState, useRef } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import SignatureCanvas from 'react-signature-canvas';

export default function ExpenseReportForm() {
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
        alert('Please provide your signature before submitting.');
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
      alert('Failed to submit expense report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

const officers = [
  "President",
  "VP Finance & Administration",
  "VP External",
  "VP Internal",
  "VP Academic",
  "VP Services",
  "VP Communications",
  "VP Social",
  "VP Philanthropic",
  "VP Equity",
  "VP Sustainability",
  "VP Francophone",
  "Other"
];


  return (
    <div className="container p-5">
      <div className="text-end mb-3">
        <a href="/login" className="btn btn-outline-secondary">Admin Login</a>
      </div>
      <div className="container-fluid text-center mb-3">
        <img src="/ess-banner.png" alt="ESS Logo" className="mb-3 w-50"></img>
        <h1><strong>Reimbursement Form</strong></h1>
      </div>

      <p>To ensure a smooth and efficient process for handling reimbursements at the University of Ottawa's Engineering Student Society (ESS), we have established this Reimbursement Form.</p>

      <p>This form has been designed to facilitate the submission and review of expenses incurred while conducting official business on behalf of ESS. We value your dedication and commitment to our mission, and we want to make sure you are promptly and fairly reimbursed for any authorized expenses you may have incurred.</p>

      <p>Before proceeding with your reimbursement request, please take a moment to carefully read and complete this form in its entirety. Ensure that you provide all necessary details, including accurate expense descriptions, dates, and supporting documentation, to expedite the reimbursement process.</p>

      <p>Our goal is to process your reimbursement request as efficiently as possible, and your cooperation in submitting complete and accurate information will greatly assist in achieving this objective. Please keep in mind the following important guidelines:</p>

      <ul>
        <li>Expense Eligibility: Only expenses that have been approved are eligible for reimbursement. Be sure to reference our budget to see approved expenses.</li>
        <li>Timely Submission: All reimbursement requests must be submitted within two weeks of incurring the expense. Late submissions may result in delays in processing.</li>
        <li>Required Documentation: You are required to provide clear and itemized receipts or supporting documentation for each expense claimed. Without proper documentation, your request may be delayed or denied.</li>
        <li>Approval Process: Once your reimbursement request is submitted, it will undergo a review and approval process. You will be notified of the status of your request as it progresses.</li>
      </ul>

      <p><strong>Payment Method:</strong> <i>Direct Deposit (preferred) // E-transfer</i></p>
      <p className="pb-3">We appreciate your dedication to ESS and your commitment to maintaining the highest standards of financial responsibility. If you have any questions or require assistance while completing this form, please do not hesitate to email <a href="mailto:vpfa@uottawaess.ca">vpfa@uottawaess.ca</a>.</p>

      <hr className="pb-3"></hr>

      <form onSubmit={submit}>
        <p className="">Non // Name (First + Last)<br></br>
        <input
          className="form-control"
          required
          value={form.name}
          onChange={(e) => updateForm("name", e.target.value)}
        />
        </p>
        
        <p>Email<br></br>
        <input
          className="form-control"
          type="email"
          required
          value={form.email}
          onChange={(e) => updateForm("email", e.target.value)}
        />
        </p>

        <p>Phone Number (e.g., 613-123-4567)<br></br>
        <input
          className="form-control"
          type="tel"
          pattern="^\d{10}$"
          required
          value={form.phone}
          onChange={(e) => updateForm("phone", e.target.value)}
        />
        </p>

        <p>Invoice Date <br></br>
          <input
            className="form-control"
            type="date"
            max={new Date().toLocaleDateString('en-CA')}
            required
            value={form.date}
            onChange={(e) => updateForm("date", e.target.value)}
          />
        </p>

        <h3 className="pt-5">Expenses</h3>

        {items.map((item, i) => (
          <div className="border rounded p-3 mb-3" key={i}>
            <p><strong>Expense #{i + 1}</strong></p>
            <div className="row g-2">
              <div className="col-md-4">
                Description <br></br>
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
                Budget <br></br>
                <select
                  className="form-control"
                  required
                  value={item.officers}
                  onChange={(e) =>
                    updateItem(i, "officers", e.target.value)
                  }
                >
                  <option value="">Select</option>
                  {officers.map((officer) => (
                    <option key={officer} value={officer}>
                      {officer}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-2">
                Budget Line <br></br>
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
                Amount <br></br>
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
                Receipt <br></br>
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
                Notes (if applicable)<br></br>
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
                Receipt attached
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
          + Add Expense
        </a>

        <div className="py-5 text-center border my-3">
          <h3 className="">Total: ${total.toFixed(2)}</h3>
        </div>
    
        <div className="col-md-6">
          <p>Recipient Signature <br></br>
          <div style={{ border: '1px solid #ccc', borderRadius: '4px' }}>
            <SignatureCanvas
              ref={sigCanvas}
              canvasProps={{
                width: 400,
                height: 200,
                className: 'sigCanvas'
              }}
              backgroundColor="white"
            />
          </div>
          <small className="text-muted">Please sign above using your mouse or touch device</small>
          <br />
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary mt-1"
            onClick={() => sigCanvas.current && sigCanvas.current.clear()}
          >
            Clear Signature
          </button>
          </p>

          <p>Date of Signature<br></br>
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
              <strong>Please confirm the nature of the expense below:</strong> <br></br>Yes, this expense has been budgeted for and is within the budgeted limits according to the latest edition of the 2025-26 budget that has been approved by the Exec Team/BOD.
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
              <strong>Declaration of Truth:</strong> <br></br>I hereby affirm that the information provided in this submission is true, complete, and accurate to the best of my knowledge.
            </label>
          </div>
        </div>

        <div className="text-center">
          <button className="btn btn-dark my-2" type="submit" disabled={!budgetConfirmed || !truthConfirmed || isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Compressing & Submitting...
              </>
            ) : (
              'Submit Expense Report'
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
