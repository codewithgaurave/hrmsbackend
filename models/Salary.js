const mongoose = require('mongoose');

const SalarySchema = new mongoose.Schema({
    month: { type: String }, // e.g. "2025-10"
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    doj: { type: Date },
    pan: { type: String },
    uan: { type: String },
    esiNumber: { type: String },


    salaryStructure: {
        basic: { type: Number, required: true },
        hra: { type: Number },
        conveyance: { type: Number },
        medical: { type: Number },
        specialAllowance: { type: Number },
        bonus: { type: Number },
        gross: { type: Number }, // Calculated
    },

    attendance: {
        totalWorkingDays: { type: Number },
        presentDays: { type: Number },
        paidDays: { type: Number },
        otHours: { type: Number }
    },

    deductions: {
        pf: { type: Number },
        esi: { type: Number },
        professionalTax: { type: Number },
        tds: { type: Number },
        advance: { type: Number },
        totalDeductions: { type: Number }, // Calculated
    },

    netSalary: { type: Number }, // Calculated
    ctc: { type: Number }, // Annual CTC

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Salary', SalarySchema);
