const CoeStaff = require('../models/CoeStaff'); // Adjust path to your Mongoose model

// @desc    Get paginated COE staff with search & filter
// @route   GET /api/coe-staff
exports.getStaff = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || '';

    let query = {};

    if (search) {
      query.$or = [
        { employeeId: { $regex: search,$options: 'i' } },
        { fullName: { $regex: search,$options: 'i' } },
        { department: { $regex: search,$options: 'i' } },
        { email: { $regex: search,$options: 'i' } },
        { phone: { $regex: search,$options: 'i' } }
      ];
    }

    if (status) {
      query.status = status;
    }

    const total = await CoeStaff.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;
    const items = await CoeStaff.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      items,
      total,
      page,
      totalPages
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error while fetching staff' });
  }
};

// @desc    Get single staff member by ID
// @route   GET /api/coe-staff/:id
exports.getStaffById = async (req, res) => {
  try {
    const staff = await CoeStaff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff member not found' });
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new COE staff record
// @route   POST /api/coe-staff
exports.createStaff = async (req, res) => {
  try {
    const { employeeId, fullName } = req.body;
    if (!employeeId || !fullName) {
      return res.status(400).json({ message: 'Employee ID and Full Name are required' });
    }

    const existing = await CoeStaff.findOne({ employeeId: employeeId.trim() });
    if (existing) {
      return res.status(400).json({ message: `Employee ID ${employeeId} already exists` });
    }

    const staff = new CoeStaff(req.body);
    const savedStaff = await staff.save();
    res.status(201).json(savedStaff);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update COE staff record
// @route   PUT /api/coe-staff/:id
exports.updateStaff = async (req, res) => {
  try {
    const updatedStaff = await CoeStaff.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedStaff) return res.status(404).json({ message: 'Staff member not found' });
    res.status(200).json(updatedStaff);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete COE staff record
// @route   DELETE /api/coe-staff/:id
exports.deleteStaff = async (req, res) => {
  try {
    const deletedStaff = await CoeStaff.findByIdAndDelete(req.params.id);
    if (!deletedStaff) return res.status(404).json({ message: 'Staff member not found' });
    res.status(200).json({ message: 'Staff member deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};