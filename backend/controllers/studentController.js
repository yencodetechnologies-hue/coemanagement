const Student = require('../models/Student');

exports.getStudents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const instCode = req.query.instCode || '';
    const batch = req.query.batch || '';

    let query = {};
    if (search) {
      query.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { registerNo: { $regex: search, $options: 'i' } },
        { admissionNo: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;
    if (instCode) query.code = instCode;
    if (batch) query.batch = batch;

    const total = await Student.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;
    const items = await Student.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);

    res.status(200).json({ items, total, page, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.photoUrl = req.file.path; // Cloudinary secure URL
    }
    const student = new Student(data);
    const saved = await student.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.photoUrl = req.file.path; // Cloudinary secure URL
    }
    const updated = await Student.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Student not found' });
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const deleted = await Student.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Student not found' });
    res.status(200).json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};